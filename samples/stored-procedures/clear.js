/**
 * A stored procedure for Azure DocumentDB which deletes documents with a specified filter key and value
 * @function
 * @param  {String} filterOn = 'type'         The key to filter documents on for deletion.
 * @param  {String} filterValue = 'session'   The value that a document's filter key must have to be deleted
 * @return {responseBody}
 */
function clear(filterOn, filterValue) {

  // set default filter key and value
  filterOn = filterOn || 'type';
  filterValue = filterValue || 'session';

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
   * Recursively deletes each session in an array, and then attempts to get more to delete
   * @function
   * @param  {Array} sessions  The array of session documents to delete
   */
  function deleteSessions(sessions) {
    if (sessions.length > 0) {

      // attempt to delete the first document in the array
      const accepted = __.deleteDocument(sessions[0]._self, function handler(err) {
        if (err) throw err;

        responseBody.deleted++;   // increment deleted counter
        sessions.shift();         // remove document from array
        deleteSessions(sessions); // delete the next doc

      });

      // if the delete request was not accepted due to timeout, return the {@link responseBody} with a continuation
      if (!accepted) response.setBody(responseBody);

    } else {

      // if there are no more documents to delete, try getting more
      getSessions();

    }
  }

  /**
   * Filters for session documents based on the provided filter key and value ({@link filterOn}, {@link filterValue}), and immediately begins deleting them as results are returned
   * @function
   * @param {String} [continuationToken]   A continuation token, if one was received from a previous request
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
     * Handler for the filter request
     * @function
     * @param  {Object} err                 The error object, if any was thrown
     * @param  {Number} err.number          The error code
     * @param  {String} err.body            The body of the error message
     * @param  {Array} sessions             The retrieved sessions
     * @param  {Object} info                Info about the request, including a continuation token
     * @param  {String} info.continuation   The continuation token, if any was passed
     * @return {responseBody}
     */
    const handler = function handler(err, sessions, info) {
      if (err) throw err;

      if (sessions.length > 0) {

        // if sessions were found, begin deleting them immediately (prioritizes deletion over searching)
        deleteSessions(sessions);

      } else if (info.continuation) {

        // if the filter came back empty but with a continuation token, get the next set of results
        getSessions(info.continuation);

      } else {

        // if there are no more documents and no continuation token, return the {@link responseBody} without a continuation
        responseBody.continuation = false;
        response.setBody(responseBody);

      }

    };

    // filter the collection for sessions using the filter function
    const accepted = __.filter(filter, { continuation: continuationToken }, handler);

    // if the filter request is not accepted due to timeout, return the response with a continuation
    if (!accepted) response.setBody(responseBody);

  }

  getSessions(); // start the stored procedure

}

module.exports = clear;
