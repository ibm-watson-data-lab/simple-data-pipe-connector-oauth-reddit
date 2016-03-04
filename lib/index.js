//-------------------------------------------------------------------------------
// Copyright IBM Corp. 2015
//
// Licensed under the Apache License, Version 2.0 (the 'License');
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an 'AS IS' BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//-------------------------------------------------------------------------------

'use strict';

var pipesSDK = require('simple-data-pipe-sdk');
var connectorExt = pipesSDK.connectorExt;

var bluemixHelperConfig = require('bluemix-helper-config');
var global = bluemixHelperConfig.global;

// TODO: Specify the passport strategy module (http://passportjs.org/) and declare it as a dependency.
//       This example utilizes the Reddit passport strategy.
var dataSourcePassportStrategy = require('passport-reddit').Strategy; 

/**
 * Sample connector that stores a few JSON records in Cloudant
 * Build your own connector by following the TODO instructions
 */
function oauthRedditConnector( parentDirPath ){

	 /* 
	  * Customization is mandatory
	  */

	// TODO: 
	//   Replace 'template' with a unique connector id (Should match the value of property "simple_data_pipe"."name" in package.json)	
	//   Replace 'Sample Data Source' with the desired display name of the data source (e.g. reddit) from which data will be loaded
	var connectorInfo = {
						  id: 'reddit_oauth_only',			// internal connector ID 
						  name: 'Reddit OAuth Data Source'	// connector display name
						};

	// TODO: customize options						
	var connectorOptions = {
					  		recreateTargetDb: true, // if set (default: false) all data currently stored in the staging database is removed prior to data load
					  		useCustomTables: true   // keep true (default: false)
						   };						

	// Call constructor from super class; 
	connectorExt.call(this, 
					 connectorInfo.id, 			
					 connectorInfo.name, 
					 connectorOptions	  
					 );	

	/**
	 * Customization is mandatory!
	 * Define the passport strategy to use for oAuth authentication with the data source
	 * @param pipe - data pipe configuration, containing the user-provided oAuth client id and client secret
	 * @returns a passport strategy for this data source
	 */
	this.getPassportStrategy = function(pipe) {

		return new dataSourcePassportStrategy({
			clientID: pipe.clientId,											 // mandatory; oAuth client id; do not change
	        clientSecret: pipe.clientSecret,									 // mandatory; oAuth client secret;do not change
	        callbackURL: global.getHostUrl() + '/auth/passport/callback',		 // mandatory; oAuth callback; do not change
	        customHeaders: { 'User-Agent': 'Simple Data Pipe demo application'}, // TODO: reddit requires a unique user-agent; change this default (https://github.com/reddit/reddit/wiki/API)
	        scope: 'identity,read'												 // See https://www.reddit.com/dev/api/oauth for scope list
		  },
		  function(accessToken, refreshToken, profile, done) {					 // Passport verify callback; customize signature as needed

			  process.nextTick(function () {

			  	// Mandatory; attach the obtained access token to the user profile
			  	// Mandatory, if applicable; also attach the obtained refresh token to the user profile
			  	// the user profile is passed as a parameter to authCallback()
		        profile.oauth_access_token = accessToken; 
		        
		        profile.oauth_refresh_token = refreshToken; 

			    return done(null, profile);
			  });
		  }
		);
	};

	/**
	 * authCallback: callback for OAuth authentication protocol; if this function is invoked the oAuth process has been completed successfully.
	 * Collects OAuth information from the OAuth server and retrieves list of available reddit data sets.
	 * @param profile - the output generated by the passport verify callback
	 * @param pipe - data pipe configuration
	 * @param callback(err, pipe ) error information in case of a problem or the updated pipe
	 */
	this.authCallback = function( profile, pipe, callback ){
				
        // Attach the token(s) and other relevant information from the profile to the pipe configuration.
        // Use this information in the connector code to access the data source

		pipe.oAuth = { 
						accessToken : profile.oauth_access_token, 
						refreshToken: profile.oauth_refresh_token 
					};

		// Fetch list of data sets that the user can choose from; the list is displayed in the Web UI in the "Filter Data" panel.
		// See @getTables for details.
        // Attach data set list to the pipe configuration
		pipe.tables = this.getTables();

		// Return the pipe configuration to the caller, who will save it.
		// In case of a fatal error, pass an error string as the first parameter 
		callback( null, pipe );			

	}; // authCallback

	/*
	 * Customization is mandatory!
	 * @return list of data sets (also referred to as tables for legacy reasons) from which the user can choose from
	 */
	this.getTables = function(){

		var dataSets = [];

		// TODO: 'Define' the data set or data sets that can be loaded from the data source. The user gets to choose one.
		// dataSets.push({name:'dataSetName', labelPlural:'dataSetName'}); // assign the name to each property
		dataSets.push({name:'RedditDataSetName', labelPlural:'RedditDataSetName'});

		// Sometimes you might want to provide the user with the option to load all data sets concurrently
		// To enable that feature, define a single data set that contains only property 'labelPlural' 
		// dataSets.push({labelPlural:'All data sets'});

		// In the UI the user gets to choose from: 
		//  -> All data sets
		//  -> sample data set 1
		//  -> ...

		// sort list; if present, the ALL_DATA option should be displayed first
		return dataSets.sort(function (dataSet1, dataSet2) {
																if(! dataSet1.name)	{ // ALL_DATA (only property labelPlural is defined)
																	return -1;
																}

																if(! dataSet2.name) {// ALL_DATA (only property labelPlural is defined)
																	return 1;
																}

																return dataSet1.name - dataSet2.name;
															   });

	}; // getTables

	/*
	 * Customization is not needed.
	 */
	this.getTablePrefix = function(){
		// The prefix is used to generate names for the Cloudant staging databases that hold your data. The recommended
		// value is the connector ID to assure uniqueness.
		return connectorInfo.id;
	};
	
	/*
	 * Customization is mandatory!
	 * Implement the code logic to fetch data from the source, optionally enrich it and store it in Cloudant.
	 * @param dataSet - dataSet.name contains the data set name that was (directly or indirectly) selected by the user
	 * @param done(err) - callback funtion to be invoked after processing is complete
	 * @param pipe - data pipe configuration
	 * @param logger - a dedicated logger instance that is only available during data pipe runs
	 */
	this.fetchRecords = function( dataSet, pushRecordFn, done, pipeRunStep, pipeRunStats, logger, pipe, pipeRunner ){

		// The data set is typically selected by the user in the "Filter Data" panel during the pipe configuration step
		// dataSet: {name: 'data set name'}. However, if you enabled the ALL option (see get Tables) and it was selected, 
		// the fetchRecords function is invoked asynchronously once for each data set.

		// Bunyan logging - https://github.com/trentm/node-bunyan
		// The log file is attached to the pipe run document, which is stored in the Cloudant repository database named pipes_db.
		// To enable debug logging, set environment variable DEBUG to '*'' or 'to sdp-pipe-run' (withoiut the quotes).
		logger.debug('Fetching data set ' + dataSet.name + ' from cloud data source.');


			var record = {
							reddit_data : '01234567890'
						 };

			/* 
			   TODO: The results of a data pipe run are persisted in Cloudant by invoking pushRecordFn, passing a single record
			         {...} or multiple records [{...}].
			         One Cloudant database is created for each data set and named using the following algorithm:
			         getTablePrefix() + dataSet.name. 
			         The total number of records is automatically calculated if this function is invoked multiple times.
			*/

			// 
			// Parameter: pass a single record or a set of records to be persisted
			//             
			pushRecordFn(record);

			// Invoke done callback to indicate that data set dataSet has been processed. 
			// Parameters:
			//  done()                                      // no parameter; processing completed successfully. no status message text is displayed to the end user in the monitoring view
			//  done({infoStatus: 'informational message'}) // processing completed successfully. the value of the property infoStatus is displayed to the end user in the monitoring view
			//  done({errorStatus: 'error message'})        // a fatal error was encountered during processing. the value of the property infoStatus is displayed to the end user in the monitoring view
			//  done('error message')                       // deprecated; a fatal error was encountered during processing. the message is displayed to the end user in the monitoring view
			return done();	

	}; // fetchRecords


}

//Extend event Emitter
require('util').inherits(oauthRedditConnector, connectorExt);

module.exports = new oauthRedditConnector();