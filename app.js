/* server framework */
var express = require( 'express' );

/* tools */
var apiAdapter = require('./apiAdapter.js');

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

/* configure the root page,
  most of everything else is an ajax request. */
app.get( '/', function( req, res ) {
  if ( req.authenticated ) {
    req.user.needsToBeAnalyzed( function( err, bool ) {
      if ( err ) { 
       console.log( err )
      /* eat it, this is just an early trigger
       for starting analysis and not critical */
      }
      if ( bool === true ) {
        /* do not pass callback or even bother to wait on this,
           it is a long-running thing */
           console.log('begin')
        apiAdapter.analyzeFollowerProfileImages( req.user );
      }
    })
  }
  res.render( 'index' );
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

/* tells the client if the user is recognized on the server */
app.get( '/loggedIn',
  function( request, response ) {
    response.json({ loggedIn: request.authenticated });
  })


/* returns the json we have for the authenticated user's twitter profile */
app.get( '/profileData',
  ensureLoggedIn,
   function( request, response ) {
    response.json( { data: request.user.twitterProfile._json } );
})

/* returns the analyzed follower data if any exists, this can be stale */
app.get( '/getFollowerData',
 ensureLoggedIn,
  function( request, response) {
    request.user.getFollowerData( function(err, followers, age) {
      if ( err ) { 
        response.json({ 'followersDataReady': false, 'followers': null, 'error': err });
        throw( "error getting follower data", err );
      }
      var proccessedAlready = ( age !== 0 ? true : false );
      if ( followers.length > 0 && proccessedAlready ) {
        response.json({ 'followersDataReady': true, 'followers': followers, 'age': age });
      }
      else {
        response.json({ 'followersDataReady': false, 'followers': followers });
      }
    });
})

/* allow the frontend to ping to see if the application is still alive */
app.get( '/areYouProcessing',
  ensureLoggedIn,
    function( request, response ) {
      request.user.areWeCurrentlyProcessing( function(err, bool) {
        if ( err ) { 
          /* Oof */
          response.json({ processing: false,  error: err })
          throw( "error detecting if processing already", err ) 
        } 
        response.json({ processing: bool });
      })
    });

/* start re-processing the user's data, unless we already started again */
app.post( '/refreshUserAnalysis',
 ensureLoggedIn,
  function( request, response ) {
    request.user.areWeCurrentlyProcessing( function( err, bool ) {
      response.json({ alreadyStarted: bool })
      if ( err ) { 
        /* Oof */
        throw( "error detecting if processing already", err ) 
      }
      if ( bool === false ) {
        /* starting it now */
        apiAdapter.analyzeFollowerProfileImages( request.user,
          function( analysis ) {
            request.user.lastFaceAnalysis = Date.now();
            request.user.save();
          });
      }
    });
})

app.get( '/logout', function( request, response ) {
  request.logout();
  response.redirect('/');
})

/* start application */
app.set( 'port', 3000 );
app.listen( app.get( 'port' ), function() {
  console.log( 'server started on port', app.get( 'port' ) )
})