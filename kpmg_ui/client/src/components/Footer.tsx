export default function Footer() {
  const legalCopy =
    "2026 KPMG Assurance and Consulting Services LLP, an Indian Limited Liability Partnership and a member firm of the KPMG global organization of independent member firms affiliated with KPMG International Limited, a private English company limited by guarantee. All rights reserved.";

  return (
    <footer className="trace-footer flex flex-nowrap items-center justify-between gap-3 px-4 md:px-6">
      <div
        className="trace-footer__copy min-w-0 flex-1 truncate whitespace-nowrap text-[9px] leading-none"
        title={legalCopy}
      >
        &copy; {legalCopy}
      </div>
      <span className="trace-footer__badge flex-shrink-0 text-[9px] font-semibold uppercase tracking-[0.35px]">
        Confidential
      </span>
    </footer>
  );
}
