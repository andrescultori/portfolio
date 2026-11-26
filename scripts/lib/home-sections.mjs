/* Feature flags for home-page sections that are being cut from the public
   site for now but should stay fully implemented and one flag-flip away
   from coming back — André wants the Process section, the side-projects
   ("Apps") list and the About section's detail table hidden, without
   deleting the code that renders them.

   renderHeader() in public-chrome.mjs also reads `process` to hide the
   corresponding nav link (desktop + mobile) whenever that section is off —
   a nav link to a hidden section would be a dead anchor. */
export const HOME_SECTIONS = {
  process: false,
  sideProjects: false,
  aboutDetails: false,
};
