import type { NavMenu } from '~/types/nav'

export const navMenu: NavMenu[] = [
  {
    heading: '',
    items: [
      {
        title: 'Home',
        icon: 'i-lucide-home',
        link: '/',
      },
    ],
  },
  {
    heading: '',
    items: [
      {
        title: 'Projects',
        icon: 'i-lucide-folder',
        link: '/projects',
      },
      {
        title: 'Skills',
        icon: 'i-lucide-folder-kanban',
        link: '/skills',
      },
    ],
  },
]
