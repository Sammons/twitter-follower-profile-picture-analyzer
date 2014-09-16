/* server framework */
var express = require( 'express' );

/* tools */
var async   = require('async'),
    request = require('request'),
    facepp  = require('./facepp.js'),
    apiAdapter = require('./apiAdapter.js'),
    fs      = require('fs');

/* secrets and tokens for applications, right now just twitter */
var credentials = require( './credentials.js' );

/* twitter api */
var Twit = require( 'twit' );

/* setting up sessions and passport middleware, as well as other
  request parsing/ cookieparsing middleware.... it's all here */
var appSetup = require( './appSetup.js' );
 
/* database wrapper, for convenient loading and saving of user data */
var db = require( './databaseInterface.js' );
db.connect( function( err ) {
  if ( err !== null ) {
    throw( "Failed to connect to mongo!", err );
  }
  console.log( "connected to mongodb" );
})

/* initialize our application object */
var app = express();

/* inject the middleware into the stack */
appSetup.injectMiddleware( app );

/* add the passport routing for twitter authentication */
appSetup.setupAuth( app );

/* standard-style ejs templating */
app.set('view engine', 'ejs');

/* configure the root since this is a "single page app",
  pretty much everything else is an ajax request. */
app.get( '/', function( request, response ) {
  response.render( 'index' );
})

/* custom middleware to detect if a request has
  no authorized session to back it. In our case they
  really can't have a req.user property unless they
  are spoofing a session and fooling express-session,
  or have authorized with twitter. */
function ensureLoggedIn( req, res, next ) {
  if ( !req.authenticated ) {
    console.log('stopped unauthorized request')
    res.end();
  } else {
    next();    
  }
}

/* endpoints for ajax */
app.get( '/profileData', function( request, response ) {
  var responseJson = { data: null };
  if ( !!request.user ) {
    responseJson.data = request.user.twitterProfile._json;
  }
  response.json( responseJson );
})


var entitiesToGet = [
    "name",
    "screen_name",
    "profile_image_url"
    ]

app.get( '/getFollowerData',
 ensureLoggedIn,
  function( request, response) {
    apiAdapter.getFollowerData( request.user, function() {

    });
})

app.get( '/refreshUserAnalysis',
 ensureLoggedIn,
  function( request, response ) {
    apiAdapter.analyzeFollowerProfileImages( request.user,
      function( analysis ) {
        response.json( { data: analysis } );
      });
})

/* start application */
app.set( 'port', 3000 );
app.listen( app.get( 'port' ), function() {
  console.log( 'server started on port', app.get( 'port' ) )
})