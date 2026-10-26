local DbHandler = require("vettedrent-server.src.db_handler")
local CronRemediationMonitor = {}

-- Evaluates all active bookings and transitions expired remediation states to revoked
function CronRemediationMonitor.ScanAndEnforceTimeouts(databaseState)
    local mutated = false
    local currentTimestamp = os.time() -- Tracks active server time

    print("\n--- Running 24-Hour Remediation Cron Sweep ---")

    for bookingId, booking in pairs(databaseState.active_bookings_table) do
        if booking.cryptographic_token_status == "remediation" then
            -- Decrease the remaining remediation hour window tracker
            booking.financial_remediation_window_hours = booking.financial_remediation_window_hours - 1
            mutated = true

            print(string.format("Booking %s (%s): %d hours remaining in remediation window.", 
                bookingId, booking.legal_full_name, booking.financial_remediation_window_hours))

            -- Time-bomb execution clause
            if booking.financial_remediation_window_hours <= 0 then
                booking.cryptographic_token_status = "revoked"
                booking.financial_remediation_window_hours = 0
                
                -- Log termination record directly into transaction audit logs
                table.insert(databaseState.transaction_audit_logs, {
                    timestamp = os.date("!%Y-%m-%dT%H:%M:%SZ"),
                    booking_id = bookingId,
                    event = "REMEDIATION_WINDOW_EXPIRED",
                    details = "Corporate Housing License officially REVOKED due to unresolved bank link failure within 24 hours. Automated GMF payments paused. Initiating corporate lockout protocols."
                })

                print(string.format("[CRITICAL OVERRIDE] Booking %s remediation timeline has expired! Token revoked.", bookingId))
            end
        end
    end

    if not mutated then
        print("No active stays currently require remediation enforcement tracking loops.")
    end

    return mutated, databaseState
end

return CronRemediationMonitor
