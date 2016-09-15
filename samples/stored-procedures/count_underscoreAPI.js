/**
 * A stored procedure for Azure DocumentDB which gets a count of documents in a collection using the .filter() method of the collection.
 * @function
 * @param  {String} filterOn = 'type'         The key to filter documents on for counting.
 * @param  {String} filterValue = ''   The value that a document's filter key must have to be counted
 * @param  {String} [continuationToken]       The previous continuation token, if any was passed
 * @return {responseBody}
 */
function length(filterOn, filterValue, continuationToken) {

  // set default filter key and value
  filterOn = filterOn || 'type';
  filterValue = filterValue || '';

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
   * Filters for documents based on the provided filter key {@link filterOn} and value {@link filterValue}, and adds the number of results to the running count
   * @function
   * @param  {String} continuationToken   The continuation token, if one was received from the previous request
   */
  function getDocuments(continuationToken) {

    /**
     * Handler for the filter request.
     * @function
     * @param  {Object} err                 The error object, if any was thrown
     * @param  {Number} err.number          The error code
     * @param  {String} err.body            The body of the error message
     * @param  {Array} docs                 An array of the retrieved documents
     * @param  {Object} info                Info about the request, including a continuation token
     * @param  {String} info.continuation   The continuation token, if any was passed
     * @return {responseBody}
     */
    const handler = function handler(err, docs, info) {
      if (err) throw err;

      // if documents were found, add them to the running documents total
      documentsFound += docs.length;

      if (info.continuation) {
        // if there was a continuation token, get the next set of results
        getDocuments(info.continuation);
      } else {
        // otherwise, return the response body, including the count of the results
        response.setBody(responseBody);
      }

    };

    // filter the collection for documents using the filter function
    const accepted = __.filter(function filter(doc) {
      return doc[filterOn] === filterValue;
    }, { continuation: continuationToken }, handler);

    // if the filter request is not accepted due to timeout, return the response with a continuation
    if (!accepted) {
      responseBody.continuation = continuationToken;
      response.setBody(responseBody);
    }

  }

  getDocuments(continuationToken);

}
