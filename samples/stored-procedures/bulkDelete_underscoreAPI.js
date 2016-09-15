/**
 * A stored procedure for Azure DocumentDB which deletes documents with a specified filter key and value
 * @function
 * @param  {String} filterOn = 'type'         The key to filter documents on for deletion.
 * @param  {String} filterValue = ''   The value that a document's filter key must have to be deleted
 * @return {responseBody}
 */
function clear(filterOn, filterValue) {

  // set default filter key and value
  filterOn = filterOn || 'type';
  filterValue = filterValue || '';

  const response = __.response; // get the response object

  /**
   * The response body returned by the stored procedure
   * @const
   * @typedef {Object} responseBody
   * @type {Object} responseBody
   * @prop {Number} deleted        The number of documents which were deleted.
   * @prop {Boolean} continuation  Whether there are still more documents to delete.
   */
  const responseBody = {
    deleted: 0,
    continuation: true,
  };

  /**
   * Recursively deletes each document in an array, and then attempts to get more to delete
   * @function
   * @param  {Array} docs  The array of documents to delete
   */
  function deleteDocuments(docs) {
    if (docs.length > 0) {

      // attempt to delete the first document in the array
      const accepted = __.deleteDocument(docs[0]._self, function handler(err) {
        if (err) throw err;

        responseBody.deleted++;   // increment deleted counter
        docs.shift();         // remove document from array
        deleteDocuments(docs); // delete the next doc

      });

      // if the delete request was not accepted due to timeout, return the {@link responseBody} with a continuation
      if (!accepted) response.setBody(responseBody);

    } else {

      // if there are no more documents to delete, try getting more
      getDocuments();

    }
  }

  /**
   * Filters for documents based on the provided filter key and value ({@link filterOn}, {@link filterValue}), and immediately begins deleting them as results are returned
   * @function
   * @param {String} [continuationToken]   A continuation token, if one was received from a previous request
   */
  function getDocuments(continuationToken) {

    /**
     * Handler for the filter request
     * @function
     * @param  {Object} err                 The error object, if any was thrown
     * @param  {Number} err.number          The error code
     * @param  {String} err.body            The body of the error message
     * @param  {Array} docs                 The retrieved documents
     * @param  {Object} info                Info about the request, including a continuation token
     * @param  {String} info.continuation   The continuation token, if any was passed
     * @return {responseBody}
     */
    const handler = function handler(err, docs, info) {
      if (err) throw err;

      if (docs.length > 0) {

        // if documents were found, begin deleting them immediately (prioritizes deletion over searching)
        deleteDocuments(docs);

      } else if (info.continuation) {

        // if the filter came back empty but with a continuation token, get the next set of results
        getDocuments(info.continuation);

      } else {

        // if there are no more documents and no continuation token, return the {@link responseBody} without a continuation
        responseBody.continuation = false;
        response.setBody(responseBody);

      }

    };

    // filter the collection for documents using a filter function
    // NB: The filter function must be inlined in order to take advantage of index
    // (otherwise it will be a full scan).
    const accepted = __.filter(function filter(doc) {
      return doc[filterOn] === filterValue;
    }, { continuation: continuationToken }, handler);

    // if the filter request is not accepted due to timeout, return the response with a continuation
    if (!accepted) response.setBody(responseBody);

  }

  getDocuments(); // start the stored procedure

}
