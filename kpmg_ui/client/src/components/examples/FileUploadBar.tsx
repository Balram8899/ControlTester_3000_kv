import FileUploadBar from "../FileUploadBar";

export default function FileUploadBarExample() {
  const mockFiles = [
    new File([""], "document.pdf", { type: "application/pdf" }),
    new File([""], "data.csv", { type: "text/csv" }),
    new File([""], "report.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
  ];

  return (
    <FileUploadBar
      files={mockFiles}
      onRemoveFile={(index) => console.log("Remove file at index:", index)}
      onClearAll={() => console.log("Clear all files")}
    />
  );
}
