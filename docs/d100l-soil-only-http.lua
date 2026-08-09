function
  -- Rice仅土壤四参数：UART2、Modbus地址01。
  -- D100L网络通道须配置为 HTTP POST：
  -- http://106.14.8.100/rice-api/device-ingest/d100l2
  -- 不要使用 LanSense 的 /api/device-ingest/ 路径。
  local apiKey = "REPLACE_WITH_RICE_API_KEY"
  local testMode = true
  local testIntervalSeconds = 10
  local formalIntervalSeconds = 300
  local taskVersion = "rice_soil_only_v1"
  local nid, uartId, soilAddress = 1, 2, 1
  local reportSequence = 0

  local function call(fn)
    local ok, value = pcall(fn)
    if ok then return value end
    return nil
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

  local function crc16(hex)
    local crc = 65535
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

  local function command(address)
    local body = string.format("%02X0300000004", address)
    local crc = crc16(body)
    return body .. string.format("%02X%02X", crc % 256, math.floor(crc / 256) % 256)
  end

  local function u16(hex4)
    local hi, lo = tonumber(string.sub(hex4, 1, 2), 16), tonumber(string.sub(hex4, 3, 4), 16)
    if hi and lo then return hi * 256 + lo end
    return nil
  end

  local function s16(value)
    if value and value >= 32768 then return value - 65536 end
    return value
  end

  local function flushUart()
    for _ = 1, 50 do
      if call(function() return UartGetRecChAndDel(uartId) end) == nil then break end
      sys.wait(10)
    end
  end

  local function readSoil()
    flushUart()
    call(function() return UartSetSendCh(uartId, string.fromHex(command(soilAddress))) end)
    local allHex, expectedHeader = "", string.format("%02X0308", soilAddress)
    for _ = 1, 30 do
      sys.wait(50)
      local value = call(function() return UartGetRecChAndDel(uartId) end)
      if value then
        allHex = allHex .. cleanHex(call(function() return string.toHex(value) end))
        local start = string.find(allHex, expectedHeader, 1, true)
        if start and string.len(allHex) >= start + 25 then
          local frame = string.sub(allHex, start, start + 25)
          local crc = crc16(string.sub(frame, 1, 22))
          local low, high = tonumber(string.sub(frame, 23, 24), 16), tonumber(string.sub(frame, 25, 26), 16)
          if low ~= crc % 256 or high ~= math.floor(crc / 256) % 256 then return { status = "crc_error", rawHex = frame } end
          local moisture, temperature = u16(string.sub(frame, 7, 10)), u16(string.sub(frame, 11, 14))
          local ec, ph = u16(string.sub(frame, 15, 18)), u16(string.sub(frame, 19, 22))
          return {
            status = "ok", rawHex = frame,
            moisturePercent = round(moisture / 10, 1), temperatureC = round(s16(temperature) / 10, 1),
            ecUsCm = ec, ph = round(ph / 10, 1)
          }
        end
      end
    end
    return { status = allHex == "" and "no_uart_data" or "parse_failed", rawHex = allHex }
  end

  local function sendReport()
    reportSequence = reportSequence + 1
    local soil = readSoil()
    local report = {
      schema_version = 1, apiKey = apiKey,
      imei = tostring(call(function() return mobile.imei() end) or ""),
      datetime = os.date("%Y-%m-%d %H:%M:%S"), timestamp = os.time(), report_sequence = reportSequence,
      task_version = taskVersion, sensor_mode = "soil_only",
      soil_moisture_percent = soil.moisturePercent, soil_temperature_c = soil.temperatureC,
      soil_ec_us_cm = soil.ecUsCm, soil_ph = soil.ph,
      soil_rs485_status = soil.status, soil_rs485_hex = soil.rawHex,
      battery_mv = tonumber(call(function() return PerGetVbattV() end)),
      csq = tonumber(call(function() return mobile.csq() end)),
      cycle_status = soil.status == "ok" and "ok" or "error"
    }
    local ok, payload = pcall(function() return json.encode(report) end)
    if ok and payload and call(function() return PronetGetNetSta(nid) end) == 1 then
      call(function() return PronetSetSendCh(nid, payload) end)
    end
  end

  call(function() return PronetStopProRecCh(nid) end)
  call(function() return UartStopProRecCh(1) end)
  log.info("rice_soil_only", "started", taskVersion, testMode and "test" or "formal")
  while true do
    local ok, err = pcall(sendReport)
    if not ok then log.info("rice_soil_only", "error", tostring(err)) end
    sys.wait((testMode and testIntervalSeconds or formalIntervalSeconds) * 1000)
  end
end
