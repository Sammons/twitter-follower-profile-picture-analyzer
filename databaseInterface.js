/* database interaction, for convenience just use Mongoose & Mongo */
var mongoose = require( 'mongoose' );

/* secrets and tokens for applications, would be for database if weren't just a local thing */
var credentials = require( './credentials.js' );
var config = require( './config.js' );

var Schema = mongoose.Schema;

/* the world of this app revolves around the user document,
  pretty much everything is stored here. */
var UserSchema = new Schema({
  twitterProfile: Schema.Types.Mixed, /* generic twitter data blob */
  
  twitterTokens: { /* personalized twitter access */
    accessToken: String,
    tokenSecret: String
  },
  
  followers: [],              /* empty array notation is mixed type    */
  lastFollowerUpdate: Number, /* used to avoid abusing twitter         */
  lastFaceAnalysis: Number,   /* used to avoid abusing Face++          */
  lastVisited: Number         /* just curious when they were here last */
})


UserSchema.statics.updateOrCreateUser = function( profile, done ) {
  var User = this;

  /* Find */
  User.findOne( { 'twitterProfile.id' : profile.id },
   function( error, userDoc ) {
    /* Oops */
    if (error) {
      return done( err, userDoc ); 
    }
    /* Or Create */
    if (userDoc === null) {
      userDoc = new User();
    }
    /* initialize/update */
    userDoc.twitterProfile = profile;
    userDoc.twitterId = profile.id;
    userDoc.markModified('twitterProfile');/* required for mixed types */

    /* return */
    done (null, userDoc); 
  });

}

UserSchema.methods.updateFollowers = function( followers, done) {
  var userDoc = this;
    userDoc.followers = followers;
    userDoc.markModified( 'followers' );
    userDoc.lastFollowerUpdate = Date.now();
    userDoc.save( function( err ) {
      done ( err, userDoc ); 
    });
}

module.exports.user = mongoose.model( 'user', UserSchema );

/* hook up! */
module.exports.connect = function( done ) {
  mongoose.connect( config.mongoConnection, function( err ) {
    if ( err ) { return done( err ); }
    done( null );
  });
}