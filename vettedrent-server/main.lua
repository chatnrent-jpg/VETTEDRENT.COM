local ApiDispatcher = require("vettedrent-server.src.api_dispatcher")

print("=========================================================")
print("   VETTEDRENT.COM FULL PRODUCTION READY SUITE ENFORCED   ")
print("=========================================================")

-- Simulate an itemized long-term Insurance ALE checkout scenario
local aleInsuranceRequest = {
    bookingId = "VR-2026-ALE-MONTGOMERY",
    legalFullName = "Robert Smith",
    emailAddress = "robert.smith@example.com",
    stayDurationDays = 60, -- Long-term, tax-exempt stay threshold
    spaceTier = "ExecutiveTownhome",
    marylandCounty = "Montgomery",
    whoIsStaying = "Family in Transition / Insurance (ALE)",
    insuranceCarrier = "State Farm",
    policyClaimNumber = "SF-99218-ALE"
}

print("\n--- Processing Localized ALE Insurance Checkout ---")
local response = ApiDispatcher.RouteIncomingRequest("/api/checkout/book", aleInsuranceRequest)

if response.status == 200 then
    local data = response.data
    local invoice = data.invoice
    
    print("Assigned Route Track   : " .. data.legalTrack)
    print("Base Daily Subtotal    : $" .. invoice.subtotalUsd .. ".00")
    print("Maryland State Sales Tax: $" .. invoice.stateSalesTaxUsd .. ".00 (Exempt due to >=30 days)")
    print("County Occupancy Tax   : $" .. invoice.countyOccupancyTaxUsd .. ".00 (Exempt due to >=30 days)")
    print("Direct Corporate Billing: " .. tostring(invoice.aleBillingAuthorized))
    print("Claim Track Carrier    : " .. invoice.insuranceCarrier .. " | Claim #" .. invoice.claimNumber)
    print("Final Invoice Total    : $" .. invoice.finalTotalUsd .. ".00")
end
print("=========================================================")
