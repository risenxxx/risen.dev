/** Everything that appears in more than one place, written down once. */

export const site = {
  name: 'Evgenii Zakharov',
  domain: 'risen.dev',
  title: 'Evgenii Zakharov — product engineer',
  description:
    'Product engineer across every layer: the interface, the services behind it and the infrastructure they run on. Five production products in five domains, and eight years of it inside product teams.',
  email: 'to@risen.dev',
  location: 'Yerevan',
  timezone: 'UTC+4',
  cv: '/cv/evgenii-zakharov-cv.pdf',
  repo: 'https://github.com/risenxxx/risen.dev',
} as const

/*
  `optical` is how large a mark has to be drawn to look the same size as the
  ones beside it, since they fill the 24-unit grid differently: a square reads
  larger than a disc of the same width, and Telegram's plane is a diagonal with
  air on three sides of it. Every place that draws these picks a base size and
  multiplies, so the four stay in step wherever they appear together.
*/
export const contacts = [
  { id: 'github', label: 'github.com/risenxxx', href: 'https://github.com/risenxxx', icon: 'b-github', optical: 1 },
  { id: 'linkedin', label: 'in/risenx', href: 'https://linkedin.com/in/risenx', icon: 'b-linkedin', optical: 0.88 },
  { id: 'telegram', label: 't.me/risenx', href: 'https://t.me/risenx', icon: 'b-telegram', optical: 1.1 },
  { id: 'email', label: site.email, href: `mailto:${site.email}`, icon: 'b-mail', optical: 1 },
] as const

export const nav = [
  { href: '#work', label: 'Work' },
  { href: '#approach', label: 'Approach' },
  { href: '#stack', label: 'Stack' },
  { href: '#contact', label: 'Contact' },
] as const
