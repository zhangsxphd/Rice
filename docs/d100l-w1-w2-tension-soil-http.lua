function
  -- Rice W1/W2：UART2地址01张力计 + 地址02土壤四参数，顺序轮询避免总线冲突。
  -- 张力查询寄存器必须在现场烧录前按传感器说明书复核；当前值与样例帧010302FF3D3865一致。
  local serviceUrl = "https://rice.lansensecloud.cn/api/device-ingest/d100l2"
  local apiKey = "REPLACE_WITH_RICE_API_KEY"
  local testMode = true
  local testIntervalSeconds = 10
  local formalIntervalSeconds = 300
  local taskVersion = "rice_tension_soil_v1"
  local nid, uartId = 1, 2
  local tensionAddress, tensionStartRegister, tensionRegisterCount = 1, 0, 1
  local soilAddress, soilStartRegister, soilRegisterCount = 2, 0, 4
  local reportSequence = 0

  local function call(fn) local ok, a = pcall(fn); if ok then return a end; return nil end
  local function cleanHex(value) return string.upper(string.gsub(tostring(value or ""), "[^0-9A-Fa-f]", "")) end
  local function round(value, digits) if value == nil then return nil end; local f = 10 ^ digits; if value >= 0 then return math.floor(value*f+.5)/f end; return math.ceil(value*f-.5)/f end
  local function bxor16(a,b) local r,p=0,1; for _=1,16 do if a%2~=b%2 then r=r+p end; a,b,p=math.floor(a/2),math.floor(b/2),p*2 end; return r end
  local function crc16(hex)
    hex=cleanHex(hex); local crc=65535
    for i=1,string.len(hex),2 do crc=bxor16(crc,tonumber(string.sub(hex,i,i+1),16)); for _=1,8 do local l=crc%2; crc=math.floor(crc/2); if l==1 then crc=bxor16(crc,40961) end end end
    return crc
  end
  local function command(address,startRegister,count) local body=string.format("%02X03%04X%04X",address,startRegister,count); local crc=crc16(body); return body..string.format("%02X%02X",crc%256,math.floor(crc/256)%256) end
  local function u16(hex4) local h,l=tonumber(string.sub(hex4,1,2),16),tonumber(string.sub(hex4,3,4),16); if h and l then return h*256+l end end
  local function s16(value) if value and value>=32768 then return value-65536 end; return value end
  local function flush() for _=1,50 do if call(function() return UartGetRecChAndDel(uartId) end)==nil then break end; sys.wait(10) end end
  local function readFrame(queryHex,header,length)
    flush(); call(function() return UartSetSendCh(uartId,string.fromHex(queryHex)) end); local all=""
    for _=1,30 do sys.wait(50); local v=call(function() return UartGetRecChAndDel(uartId) end); if v then all=all..cleanHex(call(function() return string.toHex(v) end)); local i=string.find(all,header,1,true); if i and string.len(all)>=i+length-1 then local frame=string.sub(all,i,i+length-1); local crc=crc16(string.sub(frame,1,length-4)); local lo=tonumber(string.sub(frame,length-3,length-2),16); local hi=tonumber(string.sub(frame,length-1,length),16); if lo==crc%256 and hi==math.floor(crc/256)%256 then return frame,"ok" end; return nil,"crc_error" end end end
    return nil,"timeout"
  end
  local function readTension()
    local frame,status=readFrame(command(tensionAddress,tensionStartRegister,tensionRegisterCount),string.format("%02X0302",tensionAddress),14)
    if not frame then return {status=status} end
    return {status="ok",tension_kpa=round(s16(u16(string.sub(frame,7,10)))/10,1),raw_hex=frame}
  end
  local function readSoil()
    local frame,status=readFrame(command(soilAddress,soilStartRegister,soilRegisterCount),string.format("%02X0308",soilAddress),26)
    if not frame then return {status=status} end
    local m,t,e,p=u16(string.sub(frame,7,10)),u16(string.sub(frame,11,14)),u16(string.sub(frame,15,18)),u16(string.sub(frame,19,22))
    return {status="ok",moisture_percent=round(m/10,1),temperature_c=round(s16(t)/10,1),ec_us_cm=e,ph=round(p/10,1),raw_hex=frame}
  end
  local function sendReport()
    reportSequence=reportSequence+1
    local tension=readTension(); sys.wait(150); local soil=readSoil()
    local cycle=tension.status=="ok" and soil.status=="ok" and "ok" or ((tension.status=="ok" or soil.status=="ok") and "partial" or "error")
    local report={schema_version=1,apiKey=apiKey,imei=tostring(call(function() return mobile.imei() end) or ""),datetime=os.date("%Y-%m-%d %H:%M:%S"),timestamp=os.time(),report_sequence=reportSequence,task_version=taskVersion,sensor_mode="tension_soil",soil_tension_kpa=tension.tension_kpa,soil_tension_rs485_status=tension.status,soil_tension_rs485_hex=tension.raw_hex,soil_moisture_percent=soil.moisture_percent,soil_temperature_c=soil.temperature_c,soil_ec_us_cm=soil.ec_us_cm,soil_ph=soil.ph,soil_rs485_status=soil.status,soil_rs485_hex=soil.raw_hex,battery_mv=tonumber(call(function() return PerGetVbattV() end)),csq=tonumber(call(function() return mobile.csq() end)),cycle_status=cycle}
    local ok,payload=pcall(function() return json.encode(report) end); if ok and payload and call(function() return PronetGetNetSta(nid) end)==1 then call(function() return PronetSetSendCh(nid,payload) end) end
  end
  call(function() return PronetStopProRecCh(nid) end); call(function() return UartStopProRecCh(1) end)
  log.info("rice_tension","started",taskVersion,serviceUrl,testMode and "test" or "formal")
  while true do local ok,err=pcall(sendReport); if not ok then log.info("rice_tension","error",tostring(err)) end; sys.wait((testMode and testIntervalSeconds or formalIntervalSeconds)*1000) end
end
