/**
 * A stored procedure for Azure DocumentDB which gets a count of the session documents using the .filter() method of the collection.
 * @function
 * @param  {String} filterOn = 'type'         The key to filter documents on for deletion.
 * @param  {String} filterValue = 'session'   The value that a document's filter key must have to be counted
 * @param  {String} [continuationToken]       The previous continuation token, if any was passed
 * @return {responseBody}
 */
function length(filterOn, filterValue, continuationToken) {

  // set default filter key and value
  filterOn = filterOn || 'type';
  filterValue = filterValue || 'session';

  const response = __.response; // get the response object
  let documentsFound = 0;

  /**
   * The response body returned by the stored procedure
   * @const
   * @typedef {Object} responseBody
   * @type {Object} responseBody
   * @prop {Number} documentsFound  The number of documents found so far.
   * @prop {Boolean} continuation   Whether there are still more documents to find.
   */
  const responseBody = {
    documentsFound: documentsFound,
    continuation: false,
  };

  /**
   * Filters for session documents based on the provider filter key {@link filterOn} and value {@link filterValue}, and adds the number of results to the running count
   * @function
   * @param  {String} continuationToken   The continuation token, if one was received from the previous request
   */
  function getSessions(continuationToken) {

    /**
     * The filter function that returns a doc only if it has the given filter {@link filterOn} and {@link filterValue}
     * @function
     * @param  {Object} doc  The DocumentDB document to test against
     * @return {Boolean}     Whether the document has the given filter key and value
     */
    const filter = function filter(doc) {
      return doc[filterOn] === filterValue;
    };

    /**
     * Handler for the filter request.
     * @function
     * @param  {Object} err                 The error object, if any was thrown
     * @param  {Number} err.number          The error code
     * @param  {String} err.body            The body of the error message
     * @param  {Array} sessions             An array of the retrieved sessions
     * @param  {Object} info                Info about the request, including a continuation token
     * @param  {String} info.continuation   The continuation token, if any was passed
     * @return {responseBody}
     */
    const handler = function handler(err, sessions, info) {
      if (err) throw err;

      // if sessions were found, add them to the running documents total
      documentsFound += sessions.length;

      if (info.continuation) {
        // if there was a continuation token, get the next set of results
        getSessions(info.continuation);
      } else {
        // otherwise, return the response body, including the count of the results
        response.setBody(responseBody);
      }

    };

    // filter the collection for sessions using the filter function
    const accepted = __.filter(filter, { continuation: continuationToken }, handler);

    // if the filter request is not accepted due to timeout, return the response with a continuation
    if (!accepted) {
      responseBody.continuation = continuationToken;
      response.setBody(responseBody);
    }

  }

  getSessions(continuationToken);

}

module.exports = length;
