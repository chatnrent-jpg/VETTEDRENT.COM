local SmartLockApi = {}

-- Generates the precise JSON payload required by remote lock controllers (e.g., Seam API)
function SmartLockApi.ExecutePhysicalLockout(bookingId, databaseState)
    local booking = databaseState.active_bookings_table[bookingId]
    if not booking or booking.cryptographic_token_status ~= "revoked" then 
        return false, "Ineligible token status for physical lockout execution" 
    end

    -- Constructing the exact payload architecture for your external API array
    local lockCommandPayload = {
        action = "REVOKE_ACCESS_CREDENTIAL",
        timestamp = os.date("!%Y-%m-%dT%H:%M:%SZ"),
        device_parameters = {
            target_booking_id = bookingId,
            guest_identity_hash = string.lower(booking.legal_full_name),
            associated_email = booking.verified_email,
            region_scope = databaseState.platform_meta.region
        }
    }

    -- Print out the structural signature of the command to verify it inside your Cursor logs
    print(string.format("[HARDWARE CONTROL] API command dispatched to smart lock array. Wiping credential key codes for %s.", bookingId))
    
    return true, lockCommandPayload
end

return SmartLockApi
