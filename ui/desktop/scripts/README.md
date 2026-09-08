# HeyBuddyy

Put `heybuddyy` in your $PATH if you want to launch via:

```
heybuddyy .
```

This will open heybuddy GUI from any path you specify

# Unregister Deeplink Protocols (macos only)

`unregister-deeplink-protocols.js` is a script to unregister the deeplink protocol used by heybuddy like `goose://`.
This is handy when you want to test deeplinks with the development version of HeyBuddy.

# Usage

To unregister the deeplink protocols, run the following command in your terminal:
Then launch HeyBuddy again and your deeplinks should work from the latest launched heybuddy application as it is registered on startup.

```bash
node scripts/unregister-deeplink-protocols.js
```

