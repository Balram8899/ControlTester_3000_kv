export function getRcmComparisonEndpoint(source) {
    return source === "library" ? "/api/rcm_compliance_v2" : "/api/rcm_compliance";
}
export function canRunRcmComparison(source, selectedLibraryDocIds, uploadedRegulationFiles, rcmFile) {
    if (!rcmFile) {
        return false;
    }
    return source === "library"
        ? selectedLibraryDocIds.length >= 1
        : uploadedRegulationFiles.length >= 1;
}
export function getRcmProcessingDescription(source, selectedLibraryDocIds, uploadedRegulationFiles) {
    return source === "library"
        ? `Comparing RCM against ${selectedLibraryDocIds.length} library regulation(s)`
        : `Comparing RCM against ${uploadedRegulationFiles.length} uploaded regulation(s)`;
}
