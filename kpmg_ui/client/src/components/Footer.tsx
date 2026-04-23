export default function Footer() {
  return (
    <footer
      className="trace-footer flex flex-wrap items-center justify-between gap-2 px-6 py-2.5 md:px-10"
      style={{
        background: "#E9EEF5",
        borderTop: "1px solid rgba(0, 51, 141, 0.08)",
      }}
    >
      <div
        className="text-[10.5px] leading-snug"
        style={{ color: "#5A6478", fontFamily: "Arial, sans-serif" }}
      >
        © 2026 KPMG Assurance and Consulting Services LLP, an Indian Limited Liability Partnership and a member firm of the KPMG global organization of independent member firms affiliated with KPMG International Limited, a private English company limited by guarantee. All rights reserved.
      </div>
      <span
        className="text-[10px] font-semibold uppercase tracking-[0.5px] rounded-full px-2.5 py-0.5 flex-shrink-0"
        style={{
          color: "#4E6078",
          background: "#F7FAFD",
          border: "1px solid rgba(0, 51, 141, 0.1)",
        }}
      >
        Confidential
      </span>
    </footer>
  );
}
