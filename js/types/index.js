/**
 * Amazon書籍レビュー数トラッカー - 型定義
 */
export var AuthorExtractionMethod;
(function (AuthorExtractionMethod) {
    AuthorExtractionMethod["STRUCTURED_DATA"] = "structured_data";
    AuthorExtractionMethod["SEMANTIC_HTML"] = "semantic_html";
    AuthorExtractionMethod["TEXT_PATTERNS"] = "text_patterns";
    AuthorExtractionMethod["DOM_ANALYSIS"] = "dom_analysis";
    AuthorExtractionMethod["MANUAL"] = "manual";
})(AuthorExtractionMethod || (AuthorExtractionMethod = {}));
export var ErrorCode;
(function (ErrorCode) {
    ErrorCode["NETWORK_ERROR"] = "NETWORK_ERROR";
    ErrorCode["VALIDATION_ERROR"] = "VALIDATION_ERROR";
    ErrorCode["STORAGE_ERROR"] = "STORAGE_ERROR";
    ErrorCode["EXTRACTION_ERROR"] = "EXTRACTION_ERROR";
    ErrorCode["RENDER_ERROR"] = "RENDER_ERROR";
    ErrorCode["UNKNOWN_ERROR"] = "UNKNOWN_ERROR";
})(ErrorCode || (ErrorCode = {}));
//# sourceMappingURL=index.js.map