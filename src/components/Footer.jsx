import { Link } from "react-router-dom";
import Logo from "./Logo";
import { LinkedInIcon, FacebookIcon, InstagramIcon, TikTokIcon, YoutubeIcon } from "./SocialIcons";

// ---------------------------------------------------------------------
// EDIT ME — replace these placeholder values with Altrium's real details.
// Everything the footer displays is driven from this one block.
// ---------------------------------------------------------------------
const COMPANY = {
  email: "hello@altrium.io",
};

const OFFICES = [
  {
    country: "United States",
    flag: "🇺🇸",
    lines: ["1250 Broadway,", "36th Floor,", "New York,", "NY 10001"],
    contact: COMPANY.email,
  },
  {
    country: "Sri Lanka",
    flag: "🇱🇰",
    lines: ["Level 3, Onyx Tower,", "Sri Jayawardenepura Mawatha,", "Sri Jayawardenepura Kotte 10100"],
    contact: "+94 11 277 2517",
  },
];

const LEARN_MORE_LINKS = [
  { label: "About Us", href: "#" },
  { label: "Careers", to: "/" },
  { label: "Contact Us", href: "#" },
  { label: "Altrium Legal", href: "#" },
];

const SOCIALS = [
  { Icon: LinkedInIcon, href: "#", label: "LinkedIn" },
  { Icon: FacebookIcon, href: "#", label: "Facebook" },
  { Icon: InstagramIcon, href: "#", label: "Instagram" },
  { Icon: TikTokIcon, href: "#", label: "TikTok" },
  { Icon: YoutubeIcon, href: "#", label: "YouTube" },
];
// ---------------------------------------------------------------------

export default function Footer() {
  return (
    <footer className="bg-ink text-white">
      <div className="max-w-6xl mx-auto px-5 py-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
        {/* Brand column */}
        <div>
          <Link to="/" className="flex items-center gap-2.5 mb-6">
            <Logo className="h-9 w-auto" />
          </Link>

          <p className="text-white/40 text-sm mb-3">Follow our socials</p>
          <div className="flex items-center gap-2 mb-8">
            {SOCIALS.map(({ Icon, href, label }) => (
              <a
                key={label}
                href={href}
                aria-label={label}
                target="_blank"
                rel="noreferrer"
                className="w-9 h-9 rounded-md bg-white/10 hover:bg-gold hover:text-ink flex items-center justify-center transition-colors"
              >
                <Icon />
              </a>
            ))}
          </div>

          <p className="text-white/30 text-sm">© {new Date().getFullYear()} Altrium. All rights reserved.</p>
        </div>

        {/* Office columns */}
        {OFFICES.map((office) => (
          <div key={office.country}>
            <h3 className="font-display font-semibold text-lg mb-4 flex items-center gap-2">
              {office.country} <span>{office.flag}</span>
            </h3>
            <p className="text-white/50 text-sm leading-relaxed">
              {office.lines.map((line) => (
                <span key={line}>
                  {line}
                  <br />
                </span>
              ))}
            </p>
            <p className="text-white mt-4 text-sm font-medium">{office.contact}</p>
          </div>
        ))}

        {/* Links column */}
        <div>
          <h3 className="font-display font-semibold text-lg mb-4">Learn More</h3>
          <ul className="space-y-3 text-sm text-white/50">
            {LEARN_MORE_LINKS.map((link) => (
              <li key={link.label}>
                {link.to ? (
                  <Link to={link.to} className="hover:text-gold transition-colors">
                    {link.label}
                  </Link>
                ) : (
                  <a href={link.href} className="hover:text-gold transition-colors">
                    {link.label}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
