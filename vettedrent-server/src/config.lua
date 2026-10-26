local Config = {}

Config.PLATFORM_NAME = "VettedRent.Com"
Config.TRACK_THRESHOLD_DAYS = 30 -- Under 30 is Transient, 30+ is Corporate Shielded

Config.SPACE_TIERS = {
    RoomSanctuary = 45,     -- $45/day floor
    PrivateSuite = 75,      -- $75/day
    ExecutiveTownhome = 106 -- $106/day
}

return Config
