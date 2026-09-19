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

export const contacts = [
  { id: 'github', label: 'github.com/risenxxx', href: 'https://github.com/risenxxx', icon: 'b-github' },
  { id: 'linkedin', label: 'in/risenx', href: 'https://linkedin.com/in/risenx', icon: 'b-linkedin' },
  { id: 'telegram', label: 't.me/risenx', href: 'https://t.me/risenx', icon: 'b-telegram' },
  { id: 'email', label: site.email, href: `mailto:${site.email}`, icon: 'u-mail' },
] as const

export const nav = [
  { href: '#work', label: 'Work' },
  { href: '#approach', label: 'Approach' },
  { href: '#stack', label: 'Stack' },
  { href: '#contact', label: 'Contact' },
] as const
