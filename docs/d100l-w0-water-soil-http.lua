function
  -- Rice W0：AII1 4–20mA水位 + UART2地址02土壤四参数。
  -- HTTP URL由D100L网络通道配置，serviceUrl仅用于现场核对，不调用未经验证的HTTP API。
  local serviceUrl = "https://rice.lansensecloud.cn/api/device-ingest/d100l2"
  local apiKey = "REPLACE_WITH_RICE_API_KEY"
  local testMode = true
  local testIntervalSeconds = 10
  local formalIntervalSeconds = 300
  local taskVersion = "rice_w0_water_soil_v1"
  local nid = 1
  local adcId = 1
  local uartId = 2
  local soilAddress = 2
  local currentMinMa = 4.0
  local currentMaxMa = 20.0
  local levelMinMm = 0.0
  local levelMaxMm = 1000.0
  local reportSequence = 0

  local function call(fn)
    local ok, a, b = pcall(fn)
    if ok then return a, b end
    return nil, nil
  end

  local function cleanHex(value)
    return string.upper(string.gsub(tostring(value or ""), "[^0-9A-Fa-f]", ""))
  end

  local function round(value, digits)
    if value == nil then return nil end
    local factor = 10 ^ digits
    if value >= 0 then return math.floor(value * factor + 0.5) / factor end
    return math.ceil(value * factor - 0.5) / factor
  end

  local function bxor16(a, b)
    local result, bitValue = 0, 1
    for _ = 1, 16 do
      if a % 2 ~= b % 2 then result = result + bitValue end
      a, b, bitValue = math.floor(a / 2), math.floor(b / 2), bitValue * 2
    end
    return result
  end

  local function crc16(hexWithoutCrc)
    local hex, crc = cleanHex(hexWithoutCrc), 65535
    if hex == "" or string.len(hex) % 2 ~= 0 then return nil end
    for index = 1, string.len(hex), 2 do
      crc = bxor16(crc, tonumber(string.sub(hex, index, index + 1), 16))
      for _ = 1, 8 do
        local lsb = crc % 2
        crc = math.floor(crc / 2)
        if lsb == 1 then crc = bxor16(crc, 40961) end
      end
    end
    return crc
  end

  local function command(address, startRegister, count)
    local body = string.format("%02X03%04X%04X", address, startRegister, count)
    local crc = crc16(body)
    return body .. string.format("%02X%02X", crc % 256, math.floor(crc / 256) % 256)
  end

  local function parseU16(hex4)
    local hi, lo = tonumber(string.sub(hex4, 1, 2), 16), tonumber(string.sub(hex4, 3, 4), 16)
    if hi and lo then return hi * 256 + lo end
    return nil
  end

  local function parseS16(value)
    if value and value >= 32768 then return value - 65536 end
    return value
  end

  local function readWater()
    local samples = {}
    for index = 1, 9 do
      local raw = tonumber(call(function() return PerGetAdcGatherValByAdcId(adcId) end))
      if raw then samples[#samples + 1] = raw end
      if index < 9 then sys.wait(100) end
    end
    if #samples == 0 then return nil, "no_adc_data", nil end
    table.sort(samples)
    local first, last = #samples >= 5 and 2 or 1, #samples >= 5 and #samples - 1 or #samples
    local total = 0
    for index = first, last do total = total + samples[index] end
    local raw = total / (last - first + 1)
    local currentMa = raw <= 30 and raw or raw / 1000
    if currentMa < 3.8 then return nil, "open_circuit_or_below_range", currentMa end
    if currentMa > 20.8 then return nil, "over_range_or_fault", currentMa end
    local ratio = (currentMa - currentMinMa) / (currentMaxMa - currentMinMa)
    local level = levelMinMm + ratio * (levelMaxMm - levelMinMm)
    return round(math.max(levelMinMm, math.min(levelMaxMm, level)), 1), "ok", round(currentMa, 3)
  end

  local function flushUart()
    for _ = 1, 50 do
      if call(function() return UartGetRecChAndDel(uartId) end) == nil then break end
      sys.wait(10)
    end
  end

  local function readFrame(queryHex, expectedHeader, expectedLength)
    flushUart()
    call(function() return UartSetSendCh(uartId, string.fromHex(queryHex)) end)
    local allHex = ""
    for _ = 1, 30 do
      sys.wait(50)
      local value = call(function() return UartGetRecChAndDel(uartId) end)
      if value then
        allHex = allHex .. cleanHex(call(function() return string.toHex(value) end))
        local start = string.find(allHex, expectedHeader, 1, true)
        if start and string.len(allHex) >= start + expectedLength - 1 then
          local frame = string.sub(allHex, start, start + expectedLength - 1)
          local crc = crc16(string.sub(frame, 1, expectedLength - 4))
          local low = tonumber(string.sub(frame, expectedLength - 3, expectedLength - 2), 16)
          local high = tonumber(string.sub(frame, expectedLength - 1, expectedLength), 16)
          if crc and low == crc % 256 and high == math.floor(crc / 256) % 256 then return frame, "ok" end
          return nil, "crc_error"
        end
      end
    end
    return nil, "timeout"
  end

  local function readSoil()
    local frame, status = readFrame(command(soilAddress, 0, 4), string.format("%02X0308", soilAddress), 26)
    if not frame then return { status = status } end
    local moisture = parseU16(string.sub(frame, 7, 10))
    local temperature = parseU16(string.sub(frame, 11, 14))
    local ec = parseU16(string.sub(frame, 15, 18))
    local ph = parseU16(string.sub(frame, 19, 22))
    return { status = "ok", moisture_percent = round(moisture / 10, 1), temperature_c = round(parseS16(temperature) / 10, 1), ec_us_cm = ec, ph = round(ph / 10, 1), raw_hex = frame }
  end

  local function sendReport()
    reportSequence = reportSequence + 1
    local level, waterStatus, currentMa = readWater()
    sys.wait(100)
    local soil = readSoil()
    local report = {
      schema_version = 1, apiKey = apiKey, imei = tostring(call(function() return mobile.imei() end) or ""),
      datetime = os.date("%Y-%m-%d %H:%M:%S"), timestamp = os.time(), report_sequence = reportSequence,
      task_version = taskVersion, sensor_mode = "water_soil", water_level_mm = level,
      water_4_20ma_status = waterStatus, water_current_ma = currentMa,
      soil_moisture_percent = soil.moisture_percent, soil_temperature_c = soil.temperature_c,
      soil_ec_us_cm = soil.ec_us_cm, soil_ph = soil.ph, soil_rs485_status = soil.status,
      soil_rs485_hex = soil.raw_hex, battery_mv = tonumber(call(function() return PerGetVbattV() end)),
      csq = tonumber(call(function() return mobile.csq() end)),
      cycle_status = waterStatus == "ok" and soil.status == "ok" and "ok" or ((level or soil.status == "ok") and "partial" or "error")
    }
    local ok, payload = pcall(function() return json.encode(report) end)
    if ok and payload and call(function() return PronetGetNetSta(nid) end) == 1 then
      call(function() return PronetSetSendCh(nid, payload) end)
    end
  end

  call(function() return PronetStopProRecCh(nid) end)
  call(function() return UartStopProRecCh(1) end)
  log.info("rice_w0", "started", taskVersion, serviceUrl, testMode and "test" or "formal")
  while true do
    local ok, err = pcall(sendReport)
    if not ok then log.info("rice_w0", "error", tostring(err)) end
    sys.wait((testMode and testIntervalSeconds or formalIntervalSeconds) * 1000)
  end
end
