export default function Footer() {
  return (
    <footer
      className="flex flex-wrap items-center justify-between gap-2 px-6 md:px-10 py-2"
      style={{
        background: "#E4E8EF",
        borderTop: "1px solid #D2D7E0",
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
          color: "#5A6478",
          background: "#F0F2F7",
          border: "1px solid #D2D7E0",
        }}
      >
        Confidential
      </span>
    </footer>
  );
}
