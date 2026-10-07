// Stand-in for heavy parsers inside the service worker; real parsing happens in the ingest worker.
export default {};
export const getDocument = () => { throw new Error('pdf parsing runs in the ingest worker'); };
export const convertToHtml = () => { throw new Error('docx parsing runs in the ingest worker'); };
export const GlobalWorkerOptions = {};
