export default function Footer() {
  return (
    <footer
      className="trace-footer flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-5 py-1 md:px-8"
    >
      <div
        className="trace-footer__copy text-[9.5px] leading-tight"
      >
        © 2026 KPMG Assurance and Consulting Services LLP, an Indian Limited Liability Partnership and a member firm of the KPMG global organization of independent member firms affiliated with KPMG International Limited, a private English company limited by guarantee. All rights reserved.
      </div>
      <span
        className="trace-footer__badge flex-shrink-0 text-[9px] font-semibold uppercase tracking-[0.35px]"
      >
        Confidential
      </span>
    </footer>
  );
}
