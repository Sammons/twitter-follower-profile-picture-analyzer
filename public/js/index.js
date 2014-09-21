  $(document).ready(function() {

    /* commonly used jquery objects */
    var $banner    = $('#banner');
    var $dashboard = $('#dashboard');
    
    var userProfile = null;

    /* function to check for user profile data on the server,
      if it exists return the profile */
    function getProfile( done ) {
      $.get('profileData', function( response, success ) {
        if ( success === "success" ) {
          userProfile = response.data || null;
          done();
        }
        /* if not successful nothing happens */
      })
    }

    function loadPage() {
      /* reset dashboard and userprofile */
      $dashboard.children().remove();
      userProfile = null;
      /* request userprofile from server */
      getProfile(function() {
        if ( userProfile === null ) { renderBannerNotLoggedIn(); }
        else { renderBannerLoggedIn(); }
      })
    }
    loadPage();

    function setHeader( text ) {
      $banner.children('h1').text( text );
    }
    function setHeaderPhrase( text ) {
      $banner.children('span').text( text );
    }
    function setHeaderLink( state, action ) {
      if ( state === "login") {
        $banner.children('a')
          .addClass('login')
          .removeClass('logout')
          .attr('href','/auth/twitter');
      }
      else if (state === "logout") {
        $banner.children('a')
          .addClass('logout')
          .removeClass('login')
          .attr('href','/logout');
      }
      $banner.children('a').unbind('click')
      if (action) {
        $banner.children('a').click(action);
      }
    }
    function toggleWait() {
      $('body').toggleClass('wait');
    }

    /* handlers */
    function handleAuthLinkClick(e) {
      e.preventDefault();
      var popup = window.open('/auth/twitter',"");
      window.onfocus = function(e) {
        window.onfocus = null;
        loadPage();
      }
    }
    function handleLogoutLinkClick(e) {
      e.preventDefault(); 
        $.get('/logout',function() {
          loadPage();
        }) 
    }
    /* **** */

    function renderBannerNotLoggedIn() {
      setHeader('You are not logged in.');
      setHeaderPhrase('I really am sorry that you have to authenticate. Don\'t worry, what comes next is totally worth it...');
      setHeaderLink('login', handleAuthLinkClick );
      $('#summary').text('');
    }

    function renderBannerLoggedIn() {
      setHeader('Welcome '+userProfile.name);
      setHeaderLink('logout', handleLogoutLinkClick );
      if (checkForFollowerData()) {
        renderFollowers();
      } else {
        getFollowerData(function( bool ) {
          if ( bool ) {
            renderFollowers();
            calculateOverallStats();
            renderOverallStats();
          } 
          else {
            setTimeout( renderBannerLoggedIn, 750 );
          }
        });
      }
    }

    function calculateOverallStats() {
      var femaleCount = 0;
      var maleCount = 0;
      var races = {};
      var ages = [];

      var mostGender, avgAge, mostRace = { race: 'white', count: 0 };
      userProfile.followersWithOneFace = 0;
      for ( var i = 0; i < userProfile.followers.length ; i++ ) {
        var cur = userProfile.followers[i].data;
        if (cur.face.length !== 1) continue;

        userProfile.followersWithOneFace++
        var followerFace = cur.face[0].attribute;

        if (followerFace.gender.value == 'Female') femaleCount++;
        if (followerFace.gender.value == 'Male'  )   maleCount++;
        if (!races[ followerFace.race.value ]) {
          races[ followerFace.race.value ] = 1;
        } else {
          races[ followerFace.race.value ]++;
          if ( races[ followerFace.race.value ] > mostRace.count ) {
            mostRace.race = followerFace.race.value;
            mostRace.count = races[ followerFace.race.value ];
          }
        }
        ages.push( followerFace.age.value );

      }

      avgAge = ages.reduce(function( val, element ) { return (val + element); });
      avgAge = avgAge / ages.length;

      mostGender = ( femaleCount > maleCount ? 'Female' : 'Male' );

      userProfile.largestGenderGroup = mostGender;
      userProfile.avgAge = avgAge;
      userProfile.largestRaceGroup = mostRace.race;

    }

    function renderOverallStats() {
      setHeaderPhrase('We have analyzed your followers! Below are the ones we found faces for ('+ ('' +userProfile.followersWithOneFace) + '/' + userProfile.followers.length +'):');
      $stats = $('#summary')
        .text('Most of your followers are '
          + userProfile.largestRaceGroup
          + ' '
          + userProfile.largestGenderGroup
          +'s and are on average '
          + Math.round(userProfile.avgAge)
          +' years old.');
    }

    function checkForFollowerData() {
      // hopefully the user has more than 0 followers...
      return (userProfile.followers && userProfile.followers.length > 0);
    }

    function renderFollower( follower ) {
      if (follower.data.face.length !== 1) return;

      $followerContainer = $('<div/>').addClass('follower');
      $followerImgWrap   = $('<a/>');
      $followerImg       = $('<img/>');
      $followerData      = $('<ul/>');

      $followerImgWrap.append($followerImg);

      $followerImg
        .attr( 'src', follower.profile_image_url )
        .attr( 'alt', 'Picture could not be found!' );
      $followerImgWrap
        .attr( 'href', 'https://twitter.com/'+follower.screen_name )

      $followerData
        .append( '<li> <b>name: </b>'+ follower.name +'</li>' )
      
      /* only deal with one face */
      $followerData.append( 
        '<li> <b>race: </b>'
        + follower.data.face[0].attribute.race.value 
        + ',confidence:'+ 
        Math.round(10*follower.data.face[0].attribute.race.confidence)/10
        +'%</li>' );
      $followerData.append( 
        '<li> <b>gender: </b>'
        + follower.data.face[0].attribute.gender.value 
        + ',confidence:'+ 
        Math.round(10*follower.data.face[0].attribute.gender.confidence)/10
        +'%</li>' );
      $followerData.append( 
        '<li> <b>age: </b>'
        + follower.data.face[0].attribute.age.value 
        + ', give or take '+ follower.data.face[0].attribute.age.range
        +' years </li>' ); 

      $followerContainer
        .append($followerImgWrap)
        .append($followerData)

      $dashboard.append( $followerContainer );
    }

    function renderFollowers() {
      $dashboard.children().remove();
      for (var i in userProfile.followers) {
        renderFollower( userProfile.followers[i] );
      }
      var followerSize = $('.follower').outerWidth(true);

      var sidePadding = ($dashboard.width() % followerSize);
      
      $dashboard.css('padding-left',sidePadding/2+'px');
    }

    function getFollowerData( done ) {
      $.get('/getFollowerData',function( data, success, response ) {
        console.log(arguments)
        if ( data.followersDataReady === true ) {
          userProfile.followers = data.followers;
          done( true );
        } else if ( data.followersDataReady === false ) {
          setHeaderPhrase('We are still processing your followers');
          $.get('/areYouProcessing', function( data, success ) {
            if (data.processing === false) {
              $.post('/refreshUserAnalysis', function() {
                done( false );
              });
            } else {
              done( false );
            }
          })
        } else {
          setHeaderPhrase('Something went wrong checking for your follower-data. Please come back and try again in a few minutes.');
        }
      }) 
    }


  })