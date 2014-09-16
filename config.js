module.exports = {
  'mongoConnection'          : 'mongodb://localhost/test',
  'ageToRetireFollowerCache' : 1000*60*5,             /* in milliseconds */
  'sessionMaxAge'            : 1000*60*60*6,          /* session max age */
  'twitterAuthCallbackUrl'   : 'http://127.0.0.1:3000/auth/twitter/callback',
  'sessionSecret'            : 'keyboard mouse',
  'logMode'                  : 'dev',                 /* for morgan, options are pretty much dev or prod */
  'assetFolder'              : __dirname + '/public' /* staticly served assets, such as CSS */

}