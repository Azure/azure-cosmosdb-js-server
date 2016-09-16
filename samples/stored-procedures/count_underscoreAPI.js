/**
 * A stored procedure for Azure DocumentDB which counts documents with a specified filter key and value
 * @function
 * @param {String} [filterKey]            A key to filter documents on. Only documents with the specified key are returned. If no key is provided, all documents are returned. If you would like to also specify a value for this key, pass the filterValue parameter as well. This parameter must be pesent if the filterValue is present.
 * @param {Any} [filterValue]             If provided, the value that the filterKey must have in order for the document to be returned. If no filterValue is provided, all documents with the specified filterKey are returned.
 * @param {String} [continuationToken]    A continuation token, if one was returned from the previous request.
 * @return {responseBody}
 */
function count(filterKey, filterValue, continuationToken) {

  if (filterValue && !filterKey) {
    throw new Error('If the "filterValue" parameter is provided, the "filterKey" parameter must be provided as well.');
  }

  const response = __.response; // get the response object

  /**
   * The response body returned by the stored procedure
   * @const
   * @typedef {Object} responseBody
   * @type {Object} responseBody
   * @prop {Number} documentsFound  The number of documents found so far.
   * @prop {Boolean} continuation   Whether there are still more documents to find.
   */
  const responseBody = {
    documentsFound: 0,
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
    const filterHandler = function filterHandler(err, docs, info) {
      if (err) throw err;

      // if documents were found, add them to the running documents total
      responseBody.documentsFound += docs.length;

      if (info.continuation) {
        // if there was a continuation token, get the next set of results
        getDocuments(info.continuation);
      } else {
        // otherwise, return the response body, including the count of the results
        response.setBody(responseBody);
      }

    };

    // filter the collection for documents using the filter object
    const accepted = __.filter(function filter(doc) {

      if (filterValue) {
        return doc[filterKey] === filterValue;
      }

      return doc.hasOwnProperty(filterKey);

    }, { continuation: continuationToken }, filterHandler);

    // if the filter request is not accepted due to timeout, return the response with a continuation
    if (!accepted) {
      responseBody.continuation = continuationToken;
      response.setBody(responseBody);
    }

  }

  getDocuments(continuationToken);

}
