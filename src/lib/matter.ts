export const DEFAULT_MATTER = [
  {
    matter_type: "front_copyright",
    title: "Copyright",
    content_html:
      "<p>Copyright © YEAR by AUTHOR. All rights reserved.</p><p>No part of this book may be reproduced without permission, except for brief quotations in reviews.</p>",
    enabled: true,
    sort_order: 0,
  },
  {
    matter_type: "front_dedication",
    title: "Dedication",
    content_html: "<p>For …</p>",
    enabled: true,
    sort_order: 1,
  },
  {
    matter_type: "front_toc",
    title: "Contents",
    content_html: "<p>Table of contents is generated on export from chapter titles.</p>",
    enabled: true,
    sort_order: 2,
  },
  {
    matter_type: "front_epigraph",
    title: "Epigraph",
    content_html: "<p><em>Optional epigraph.</em></p>",
    enabled: false,
    sort_order: 3,
  },
  {
    matter_type: "back_also_by",
    title: "Also by the Author",
    content_html: "<p>Title One<br/>Title Two</p>",
    enabled: false,
    sort_order: 10,
  },
  {
    matter_type: "back_about_author",
    title: "About the Author",
    content_html: "<p>Author bio goes here.</p>",
    enabled: true,
    sort_order: 11,
  },
  {
    matter_type: "back_sample",
    title: "Sample Chapter",
    content_html: "<p>Optional preview of the next book.</p>",
    enabled: false,
    sort_order: 12,
  },
  {
    matter_type: "back_newsletter",
    title: "Stay in Touch",
    content_html: "<p>Join the author newsletter at …</p>",
    enabled: false,
    sort_order: 13,
  },
] as const;
