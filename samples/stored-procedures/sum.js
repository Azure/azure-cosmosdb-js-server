/**
* This is executed as a stored procedure to compute the sum of a specified feature in a collection.
* To avoid script timeout on the server when there are lots of documents (100K+), the script is executed in batches,
* each batch sums the value of the specified feature in the batch docs and returns continuation token.
* The script is run multiple times, starting from empty continuation, 
* then using continuation returned by last invocation script until continuation returned by the script is null/empty string.
*
* @param {String} feature - Feature to be aggregated (required). 
* @param {String} filterQuery - Optional filter for query (e.g. "SELECT * FROM docs WHERE docs.category = 'food'").
* @param {String} continuationToken - The continuation token passed by request, continue counting from this token.
*/
function sum(feature, filterQuery, continuationToken) {

	const ERROR_CODES = {
        BAD_REQUEST: 400,
        NOT_FOUND: 404,
        CONFLICT: 409,
        RETRY_WITH: 449,
        NOT_ACCEPTED: 499
	};

	var collection = getContext().getCollection();
	var maxResult = 25; // MAX number of docs to process in one batch, when reached, return to client/request continuation. 
                        // intentionally set low to demonstrate the concept. This can be much higher. Try experimenting.
                        // We've had it in to the high thousands before seeing the stored procedure timing out.

    // The number of documents counted. 
    var documentsProcessed = 0;
    // Aggregate to keep track of
    var agg = 0;

    if (!feature) throw new Error(ERROR_CODES.BAD_REQUEST, "The 'feature' to be aggregated is not specified.");
    if (typeof (feature) !== "string") throw new Error(ERROR_CODES.BAD_REQUEST, "The 'feature' to be aggregated is not a string.");

    tryQuery(continuationToken);

    // Helper method to check for max result and call query.
    function tryQuery(nextContinuationToken) {
    	var responseOptions = { continuation: nextContinuationToken, pageSize: maxResult };

    	// In case the server is running this script for long time/near timeout, it would return false,
        // in this case we set the response to current continuation token, 
        // and the client will run this script again starting from this continuation.
        // When the client calls this script 1st time, is passes empty continuation token.
        if (documentsProcessed >= maxResult || !query(responseOptions)) {
            setBody(nextContinuationToken);
        }
    }

    function query(responseOptions) {
    	// For empty query string, use readDocuments rather than queryDocuments -- it's faster as doesn't need to process the query.
    	return (filterQuery && filterQuery.length) ? 
    		collection.queryDocuments(collection.getSelfLink(), filterQuery, responseOptions, onReadDocuments) :
    		collection.readDocuments(collection.getSelfLink(), responseOptions, onReadDocuments);
    }

    // This callback is called from collection.{queryDocuments/readDocuments}.
    function onReadDocuments(err, docFeed, responseOptions) {
    	if (err) {
    		throw 'Error while reading document: ' + err;
    	}

    	// Increment the number of documents counted so far. 
    	documentsProcessed += docFeed.length;

    	for (var i = 0; i < documentsProcessed; i++) {
    		agg += Number(docFeed[i][feature]);
    	}	

    	// If there is continuation, call query again with it,
    	// otherwise we are done, in which case set continuation to null.
    	if (responseOptions.continuation) {
    		tryQuery(responseOptions.continuation);
    	} else {
    		setBody(null);
    	}
    }

    // Set response body: use an object the client is expecting (2 properties: result and continuationToken).
    function setBody(continuationToken) {
    	var body = { sum: agg, continuationToken: continuationToken, documentsProcessed: documentsProcessed, feature: feature };
    	getContext().getResponse().setBody(body);
    }
}
