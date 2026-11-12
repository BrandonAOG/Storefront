/** Simple line icons for the call controls. */
const paths: Record<string, React.ReactNode> = {
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
  micOff: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M4 4l16 16" /></>,
  cam: <><rect x="3" y="7" width="13" height="10" rx="2" /><path d="M16 10.5l5-3v9l-5-3z" /></>,
  camOff: <><rect x="3" y="7" width="13" height="10" rx="2" /><path d="M16 10.5l5-3v9l-5-3zM4 4l16 16" /></>,
  snap: <><path d="M4 8h3l2-2.5h6L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>,
  screen: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>,
  pin: <><path d="M12 21s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.5-6 10-6 10z" /><circle cx="12" cy="11" r="2" /></>,
  notes: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M8 9h8M8 13h8M8 17h5" /></>,
  end: <path d="M3 14.5c5-5.3 13-5.3 18 0l-2.4 2.3-3.1-1.5v-2.4c-2.2-.7-4.8-.7-7 0v2.4l-3.1 1.5z" />,
  chevron: <path d="M6 15l6-6 6 6" />,
  flip: <path d="M4 11a8 8 0 0 1 14-4l2-2v6h-6l2.2-2.2M20 13a8 8 0 0 1-14 4l-2 2v-6h6l-2.2 2.2" />,
  light: <path d="M8 3h8l-1.5 6h-5zM10 9h4v4l-1 2v6h-2v-6l-1-2z" />,
  zoom: <><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5M11 8.5v5M8.5 11h5" /></>,
};

export function Icon({ name, className = "h-6 w-6" }: { name: keyof typeof paths | string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {paths[name]}
    </svg>
  );
}
