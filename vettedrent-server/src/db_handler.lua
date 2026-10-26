local Config = require("vettedrent-server.src.config")
-- Utilizing standard JSON encoding libraries or platform-native HTTP parsers
local HttpService = game:GetService("HttpService")

local DbHandler = {}
local FILE_PATH = "vettedrent-server/data/database.json"

-- Read active state from disk
function DbHandler.LoadDatabase()
    -- Reads from the data/database.json store
    local success, content = pcall(function()
        return HttpService:JSONDecode(HttpService:GetAsync(FILE_PATH))
    end)
    
    if success and content then
        return content
    else
        warn("[VettedRent DB Error] Could not load database.json parsing failure.")
        return nil
    end
end

-- Write and update state mutations back to disk
function DbHandler.SaveDatabase(databaseState)
    local success, jsonString = pcall(function()
        return HttpService:JSONEncode(databaseState)
    end)
    
    if success and jsonString then
        -- Pushes the updated JSON string back into the local environment storage
        local writeSuccess = pcall(function()
            HttpService:PostAsync(FILE_PATH, jsonString)
        end)
        return writeSuccess
    end
    return false
end

-- Fast state mutation hook for webhook transactions
function DbHandler.UpdateTokenStatus(bookingId, newStatus)
    local db = DbHandler.LoadDatabase()
    if not db or not db.active_bookings_table[bookingId] then return false end
    
    -- Mutate the token configuration state directly
    db.active_bookings_table[bookingId].cryptographic_token_status = newStatus
    
    -- Inject updated entry inside the audit log ledger
    table.insert(db.transaction_audit_logs, {
        timestamp = os.date("!%Y-%m-%dT%H:%M:%SZ"),
        booking_id = bookingId,
        event = "TOKEN_STATE_MUTATED_BY_CORE",
        details = "Cryptographic tracking parameter altered to: " .. newStatus
    })
    
    return DbHandler.SaveDatabase(db)
end

return DbHandler
