twitter-follower-profile-picture-analyzer
=========================================

Pulls followers of the user and runs analysis on their faces to get demographics.

Notes
--

to start, run `npm install` which will read the package.json file and get the dependencies for the app.

*    credentials for face++ and twitter must be placed in credentials.js
*    Twitter is configured to allow logins only at 127.0.0.1:3000, do not use localhost!
*    The app assumes there is a local instance of MongoDB running, and will attempt to connect to 'test', it will trample the 'user' collection if one already existed
*    If the app dies while it is processing (for any reason), it will never finish because there is a processing boolean associated with a user... and will only initiate the processing when the boolean is set to false.
*    To start just run `node app` and enjoy!
