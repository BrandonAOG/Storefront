/**
 * Storefront content, written from alwaysongenerators.com.
 *
 * No prices are listed because the website doesn't publish any. A service with
 * priceCents 0 and priceType "fixed" can be booked online and shows "Price
 * confirmed before work begins". priceType "quote" shows "Free estimate".
 * A plan with priceCents 0 shows "Call for pricing". Add real prices in /admin.
 */
export const SETTINGS = {
  businessName: "Always On Generators",
  phone: "239-839-3553",
  email: "office.aog@gmail.com",
  heroHeadline: "Whole-home standby generators, installed and serviced by your local Southwest Florida team.",
  heroSub: "Book generator service online any time, or request a free estimate for a new installation.",
};

const process3 = "Free estimate with a clear, flat quote\nPermits filed within 24 hours\nOne project manager coordinates everything on site\nFully tested equipment at startup";

export const SERVICES = [
  {
    slug: "generator-maintenance", name: "Generator maintenance", category: "Generator service", sortOrder: 10, priceType: "fixed", priceCents: 0,
    summary: "Routine service that keeps your standby generator ready when an outage hits.",
    includes: "25-point inspection\nOil and filter service\nBattery diagnostics and terminal treatment\nFuel system check and cleaning\nAnti-corrosion treatment\nTransfer switch inspection\nSimulated outage test\nService report after the visit",
    description: "Our technicians change fluids and filters, inspect key components, test generator operation and identify developing issues before they lead to failure.\n\nWith Southwest Florida's heat, humidity, coastal air and long storm season, regular maintenance is especially important. Most manufacturers recommend service at least once a year, and Generac requires regular service to keep its warranty active.\n\nWe service Generac, Kohler, Cummins and other major brands, whether or not we installed the unit.",
  },
  {
    slug: "generator-repair", name: "Generator repair", category: "Generator service", sortOrder: 20, priceType: "fixed", priceCents: 0,
    summary: "Any brand, diagnosed the same week. Most repairs are finished on the first visit.",
    includes: "Diagnostics and load testing\nRepair of the failed component\nFactory-authorized warranty repair where it applies\nTesting and confirmation before we leave",
    description: "For generators that will not start, fail to produce power, or show warning signs before the next outage. Common causes include a dead battery, a transfer switch that is not engaging, or a control or sensor fault.\n\nWe service Generac, Kohler, Cummins and other major brands, whether or not we installed the unit.\n\nIf it can't wait, call our 24/7 emergency line instead of booking online.",
  },
  {
    slug: "generator-installation", name: "Generator installation", category: "Installation", sortOrder: 30, priceType: "quote", priceCents: 0,
    summary: "Whole-home standby generators, sized for your home and installed start to finish.",
    includes: process3,
    description: "We handle generator sizing and load calculations, site preparation and the generator pad, the transfer switch, electrical and fuel connections, startup and testing.\n\nWe are a Certified Generac Prestige dealer and an Authorized Kohler Titanium Dealer.\n\nCost depends on the size of the generator, the fuel source and the complexity of the installation, so every project starts with a free in-home or virtual estimate. Financing is available.",
  },
  {
    slug: "propane-tank-installation", name: "Propane tank installation", category: "Installation", sortOrder: 40, priceType: "quote", priceCents: 0,
    summary: "A dependable on-site fuel supply for homes without natural gas service.",
    includes: "Property and generator assessment\nTank sizing and placement\nSite preparation and installation\nGenerator connection\nTesting and final review",
    description: "We evaluate your generator, property, fuel needs and available space to plan the right propane setup, then coordinate the tank, fuel line and generator connection.",
  },
  {
    slug: "manual-transfer-switches", name: "Manual transfer switches", category: "Installation", sortOrder: 50, priceType: "quote", priceCents: 0,
    summary: "A safer way to power selected circuits from a portable generator.",
    includes: "Electrical and generator assessment\nCircuit planning\nInstallation and connection\nTesting and walkthrough",
    description: "Instead of running extension cords through the house, a properly installed transfer switch or interlock kit connects your portable generator to the electrical panel while keeping generator and utility power separated.",
  },
  {
    slug: "electrical-panel-upgrades", name: "Electrical panel upgrades", category: "Electrical", sortOrder: 60, priceType: "quote", priceCents: 0,
    summary: "Replace an outdated, damaged or undersized panel.",
    includes: "Electrical assessment\nUpgrade recommendation\nPermitting and installation\nTesting and inspection",
    description: "Whether you are preparing for a standby generator, adding an EV charger or updating an older system, our licensed team evaluates your current setup and recommends the right upgrade.",
  },
  {
    slug: "ev-charger-installation", name: "EV charger installation", category: "Electrical", sortOrder: 70, priceType: "quote", priceCents: 0,
    summary: "Level 2 home charging, installed by licensed electricians.",
    includes: "Electrical assessment\nCharger and installation planning\nElectrical upgrades if needed\nPermitting and installation\nTesting and final walkthrough",
    description: "A Level 2 charger significantly reduces charging time compared with a standard 120V outlet. We handle the electrical work behind the charger, including a dedicated circuit and any upgrades your home needs.",
  },
  {
    slug: "whole-house-surge-protection", name: "Whole house surge protection", category: "Electrical", sortOrder: 80, priceType: "quote", priceCents: 0,
    summary: "Panel-level protection against voltage spikes from storms and lightning.",
    includes: "Electrical assessment\nSurge protection recommendation\nInstallation\nTesting and final check",
    description: "Power surges can damage appliances, electronics, HVAC equipment and smart-home devices. A whole-home protector at the panel adds a layer of protection for everything connected to it.",
  },
  {
    slug: "electrical-wiring-rewiring", name: "Electrical wiring & rewiring", category: "Electrical", sortOrder: 90, priceType: "quote", priceCents: 0,
    summary: "Wiring repairs, partial or whole-home rewiring, and new dedicated circuits.",
    includes: "Inspection of the existing wiring\nA clear explanation of what needs attention\nWiring repair, partial or whole-home rewiring\nNew and dedicated circuits",
    description: "If outlets feel warm, lights flicker, breakers keep tripping, or you are planning a remodel, it may be time to have the wiring checked.",
  },
  {
    slug: "commercial-generators", name: "Commercial generators", category: "Commercial", sortOrder: 100, priceType: "quote", priceCents: 0,
    summary: "Installation, repair and maintenance of standby power for businesses and facilities.",
    includes: "Generac and Kohler commercial standby systems\nSizing around your building's critical loads\nRepair for Generac, Kohler and Cummins\nScheduled maintenance and documentation",
    description: "From HVAC and refrigeration to pumps, lighting, servers and security systems, we help make sure your facility has the backup power it needs when utility service is interrupted. For a commercial emergency, call our 24/7 line.",
  },
];

const monitoring = "Electronic monitoring between visits";
export const PLANS = [
  { slug: "standard", name: "Standard", sortOrder: 10, priceCents: 0, interval: "year", summary: "Annual maintenance and monitoring.", features: `Scheduled annual maintenance\n${monitoring}\nService documentation after each visit` },
  { slug: "deluxe", name: "Deluxe", sortOrder: 20, priceCents: 0, interval: "year", summary: "More frequent wellness visits and added benefits.", features: `Scheduled maintenance\nMore frequent wellness visits\n${monitoring}\nAdditional benefits` },
  { slug: "always-on", name: "Always On", sortOrder: 30, priceCents: 0, interval: "year", summary: "More frequent wellness visits and additional support.", features: `Scheduled maintenance\nMore frequent wellness visits\n${monitoring}\nAdditional support throughout the year` },
];

/** The made-up starter rows from the first version, removed by `npm run db:site-content`. */
export const OLD_SERVICE_SLUGS = ["annual-maintenance", "oil-filter-service", "battery-replacement", "diagnostic-call", "new-generator-installation", "transfer-switch-upgrade"];
export const OLD_PLAN_SLUGS = ["essential", "plus", "monthly"];
