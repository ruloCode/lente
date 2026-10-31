// Copy to cloud.h (git-ignored) to point the clip at a cloud hub over wss:// instead of the laptop.
// Delete cloud.h to go back to the laptop hub on the LAN.
// The token comes from the hub: modal container exec <id> node scripts/hub-token.ts add clip
#define HUB_CLOUD_HOST "your-workspace--lente-hub-hub.us-east.modal.run"
#define HUB_DEVICE_TOKEN "the-token-printed-once"
