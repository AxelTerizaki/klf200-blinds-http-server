# klf200-blinds-http-server
Simple HTTP server to communicate with the Velux KLF 200 box to work with Somfy IO blinds

**This is a proof of concept** even though I use this everyday in my home automation setup. It might help you understanding h ow to handle the KLF 200 

- First, setup your Velux KLF 200 as per the instructions in the manual, and make sure to name your blinds correctly in the interface.
- Rename `positions.sample.json` into `positions.json` and change the names of th eblinds, and names of the rooms. Assume the default position is 0 (opened)
- Edit `index.js` and the `connect()` function. 
  - `xxx` should be your KLF 200's IP on your network
  - `yyy` should be **the Wifi password**. Yes, that's strange, it's not the admin password you need to use on the web interface, but the password to connect to the internal Wifi the KLF runs for administration. 

From there you can get position from the blinds, and set their position using the two endpoints (GET and PUT) 
