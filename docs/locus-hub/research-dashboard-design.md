# What makes the best dashboards great: research for the Locus redesign

Date: 2026-10-07. Purpose: ground the Locus hub redesign (owner, media buyer, creative strategist, client share view) in the serious design literature and in the products people hold up as excellent today. Every bullet carries a source URL. Where a detail could not be sourced it says so.

The owner's brief, in his words: "modern, futuristic, a real professional app; you look at it and go: this is clean, this is all the data I ever wanted, right in front of me, easy to access."

Sections:
1. Dashboard design principles from the serious sources
2. Product teardowns (2024 to 2026)
3. Patterns to borrow
4. Anti-patterns to avoid
5. A visual system for Locus

---

## 1. Dashboard design principles from the serious sources

### 1.1 Stephen Few: what a dashboard is, and the single-screen rule

- Definition: a dashboard is "a visual display of the most important information needed to achieve one or more objectives; consolidated and arranged on a single screen so the information can be monitored at a glance." https://speckyboy.com/designing-information-dashboards/ and http://www.uxmatters.com/mt/archives/2007/04/book-review-information-dashboard-design.php
- The core challenge, in Few's own paper "Why Most Dashboards Fail" (2007): "display all the required information on a single screen: clearly and without distraction, in a manner that can be quickly examined and understood." https://blogs.ischool.berkeley.edu/i247s13/files/2013/02/WhyMostDashboardsFail.pdf
- The monitoring sequence the layout must support, in order: (1) get an overview and spot what needs attention, (2) look closer at each item that needs attention, (3) use the dashboard as "a seamless launch pad" to the detail needed to act. This is the overview, then focus, then drill pattern. https://blogs.ischool.berkeley.edu/i247s13/files/2013/02/WhyMostDashboardsFail.pdf
- Why scrolling fails: viewers should not scroll or switch screens because "human short-term memory cannot retain multiple data chunks"; related information must be visible at the same time. https://www.thedataschool.co.uk/anh-vu/are-you-making-these-13-dashboard-design-mistakes/
- "You must condense the information, you must include only what you absolutely need, and you must use display media that can be easily read and understood." "Anything that doesn't add meaning to the data must be thrown out, especially those flashy visual effects." "Elegance in communication is often achieved through simplicity of design." https://blogs.ischool.berkeley.edu/i247s13/files/2013/02/WhyMostDashboardsFail.pdf
- Few's worked example: seven key metrics, each with the actual value, a 12-month sparkline for history, and a bullet graph for percent of target, "all in roughly the same amount of space" as three gauges. The only color on the panel is one small red icon beside the metric that needs attention: "Because no colors other than blacks and grays appear anywhere in the display other than the red icon, nothing distracts you from quickly finding what needs your attention most." https://blogs.ischool.berkeley.edu/i247s13/files/2013/02/WhyMostDashboardsFail.pdf
- A number with no comparison is useless: of a gauge reading 7,822 YTD units Few asks "Compared to what? ... how good or bad? Are we on track? Is this better than before?" Every headline number needs a target, a prior period, or a trend beside it. https://blogs.ischool.berkeley.edu/i247s13/files/2013/02/WhyMostDashboardsFail.pdf

### 1.2 Few's thirteen common mistakes (Information Dashboard Design)

The list, as summarised from the book:
1. Exceeding the boundaries of a single screen
2. Supplying inadequate context for the data
3. Displaying excessive detail or precision
4. Expressing measures indirectly (a deficient measure)
5. Choosing inappropriate display media
6. Introducing meaningless variety
7. Using poorly designed display media
8. Encoding quantitative data inaccurately
9. Arranging the information poorly
10. Highlighting important information ineffectively or not at all
11. Cluttering the display with visual effects
12. Misusing or over-using color
13. Designing an unattractive visual display
Source for the list: https://www.thedataschool.co.uk/anh-vu/are-you-making-these-13-dashboard-design-mistakes/ and https://www.thedataschool.co.uk/anh-vu/are-you-making-these-13-dashboard-design-mistakes-part-2

Concrete rules pulled out of them:
- Precision: "Dashboards should provide a high-level overview with just enough information for viewers to grasp it quickly." Over-precise numbers slow comprehension; round them. https://www.thedataschool.co.uk/anh-vu/are-you-making-these-13-dashboard-design-mistakes/
- Meaningless variety: do not switch chart types to avoid monotony; consistency lets the eye interpret faster. https://www.thedataschool.co.uk/anh-vu/are-you-making-these-13-dashboard-design-mistakes/
- Poorly designed media: label data directly instead of using legends, use color sparingly for emphasis, no 3D. https://www.thedataschool.co.uk/anh-vu/are-you-making-these-13-dashboard-design-mistakes-part-2
- Inaccurate encoding: bar charts whose axis does not start at zero exaggerate small differences. https://www.thedataschool.co.uk/anh-vu/are-you-making-these-13-dashboard-design-mistakes-part-2
- Arrangement: when comparing data sets, put the charts adjacent and on the same scale. https://www.thedataschool.co.uk/anh-vu/are-you-making-these-13-dashboard-design-mistakes-part-2
- Highlighting: critical items should be visually distinct (bolder color, larger text, a marker) so the user does not have to hunt for them. https://www.thedataschool.co.uk/anh-vu/are-you-making-these-13-dashboard-design-mistakes-part-2
- Decoration "only distracts viewers"; simplicity is the aesthetic. https://www.thedataschool.co.uk/anh-vu/are-you-making-these-13-dashboard-design-mistakes-part-2
- Chapter 7 (organising for usability): group information by business function and entity, co-locate related items, delineate groups minimally (white space before borders), support meaningful comparisons, keep the design consistent, and design the dashboard "as a portal" that launches into supplementary detail. "The guiding principle in dashboard design should always be simplicity." http://www.uxmatters.com/mt/archives/2007/04/book-review-information-dashboard-design.php
- Few's display media library for dashboards: bullet graphs, bar graphs, line graphs, sparklines, scatter plots, treemaps; icons for alerts, direction and status; text for labels and values; tables, spatial maps and small multiples as organisers. Notably absent: pies, gauges, donuts. http://www.uxmatters.com/mt/archives/2007/04/book-review-information-dashboard-design.php

### 1.3 Few on position and salience (where things go on the screen)

- Few cites the Poynter Institute Eyetrack III "priority zones": readers pay the most attention to the upper left and the middle left of a screen; prominence falls as you move right and down. Put the most important information top left, the least important bottom right. https://www.dummies.com/article/excel-dashboard-design-principle-use-layout-and-placement-to-draw-focus-138383 (summarising Few) and https://www.tableau.com/blog/how-design-thinking-will-affect-todays-analysts-93507
- "Leverage location and placement to draw focus to the most important components on your dashboard" rather than relying on bright color or exaggerated size. Surrounding colors, borders and fonts can shift those natural zones, so keep the chrome quiet. https://www.dummies.com/article/excel-dashboard-design-principle-use-layout-and-placement-to-draw-focus-138383
- A 2026 eye-tracking study (Sultanum and Setlur, "Not Always Top-Left") confirms that layout is only one signal; "visual saliency, semantics, functional roles, interaction, and user context" also steer reading order. The implication: do not fight the top-left habit, but make the one thing you want read first also the most salient thing on the screen. https://arxiv.org/abs/2608.06845
- Preattentive attributes (processed in milliseconds, before conscious attention): color hue and intensity, 2D position, form (orientation, line length, width, size, shape), and motion. "Each of these visual attributes can be consciously applied to dashboard design to group or highlight information." Gestalt principles (proximity, similarity, enclosure, closure, continuity, connection) do the grouping. http://www.uxmatters.com/mt/archives/2007/04/book-review-information-dashboard-design.php
- Which attributes carry quantity accurately: "2-D position and the length of straight linear objects such as these bars, which share a common baseline and run parallel to one another are visual attributes that we can perceive with a high degree of accuracy." Pie slices fail because area, angle and arc length are all perceived imprecisely. Working memory holds only a few items at once, so "encoding information visually ... allows more information to be chunked together." https://ixdf.org/literature/book/the-encyclopedia-of-human-computer-interaction-2nd-ed/data-visualization-for-human-perception

### 1.4 Few's bullet graph specification (the replacement for gauges)

From "Bullet Graph Design Specification", last revised 2013: http://www.perceptualedge.com/articles/misc/Bullet_Graph_Design_Spec.pdf
- Purpose: "developed to replace the meters and gauges that are often used on dashboards. Its linear and no-frills design provides a rich display of data in a small space, which is essential on a dashboard." Linear reads faster than radial. http://www.perceptualedge.com/articles/misc/Bullet_Graph_Design_Spec.pdf
- Five components: a text label; a quantitative scale on one linear axis; the featured measure (a bar); one or two comparative measures (a short perpendicular line, e.g. target or last year); two to five qualitative ranges (ideally three) as background fills. http://www.perceptualedge.com/articles/misc/Bullet_Graph_Design_Spec.pdf
- Featured measure: "100% black with a heavy stroke weight", about one third the thickness of its container, no border. Comparative marker: 100% black but visibly less dominant; a second marker at 75% black. http://www.perceptualedge.com/articles/misc/Bullet_Graph_Design_Spec.pdf
- Qualitative ranges: never distinct hues (colorblindness); use intensities of one hue, dark for poor and light for good. Three ranges: 40%, 25%, 10% black. Two ranges: 35% and 10%. Five ranges: 50%, 35%, 20%, 10%, 3%. http://www.perceptualedge.com/articles/misc/Bullet_Graph_Design_Spec.pdf
- Scale starts at zero; tick marks light gray and thin; labels 100% black, small. http://www.perceptualedge.com/articles/misc/Bullet_Graph_Design_Spec.pdf
- Alternative designs cover negative values, and metrics where low is good (expenses, CPA): reverse the fill sequence. http://www.perceptualedge.com/articles/misc/Bullet_Graph_Design_Spec.pdf
- Optional projection segment: split the bar into actual-to-date and projected-to-period-end so you can see whether you are on pace, not just how far you are from the target. This is exactly the "pace bar" Locus already has on Home. http://www.perceptualedge.com/articles/misc/Bullet_Graph_Design_Spec.pdf
- Few on gauges in his blog: "Idiot lights and flashy dashboard gauges are great if you don't know what you're doing and don't care to learn"; the research behind car-style gauges on business dashboards is "zilch"; they are skeuomorphs. The bullet graph takes "approximately one minute to learn how to read." https://www.perceptualedge.com/blog/?p=1423

### 1.5 Few's nine rules for color (Practical Rules for Using Color in Charts, 2008)

Source: https://www.perceptualedge.com/articles/visual_business_intelligence/rules_for_using_color.pdf (mirror: https://www.makinggood.ac.nz/media/1257/few_2008_rules_for_using_color.pdf)
1. "If you want different objects of the same color in a table or graph to look the same, make sure that the background ... is consistent." So: no gradients or varying backgrounds behind data.
2. "If you want objects in a table or graph to be easily seen, use a background color that contrasts sufficiently with the object."
3. "Use color only when needed to serve a particular communication goal." Never to decorate.
4. "Use different colors only when they correspond to differences of meaning in the data." A bar chart with a different color per bar makes people search for a meaning that is not there.
5. "Use soft, natural colors to display most information and bright and/or dark colors to highlight information that requires greater attention." Few keeps three palettes: a medium palette for most data, a bright/dark one for highlights and thin lines, and a pale one for non-data parts and de-emphasised data.
6. For sequential quantitative values, "stick with a single hue ... and vary intensity from pale colors for low values to increasingly darker and brighter colors for high values." Hue order is not intuitive; intensity order is.
7. "Non-data components of tables and graphs should be displayed just visibly enough to perform their role, but no more so." Defaults: axis lines thin medium gray; borders usually unnecessary, thin gray when needed; background white (or none).
8. "Avoid using a combination of red and green in the same display." About 10% of men cannot tell them apart; blue and red is the suggested pair for positive and negative in a heatmap.
9. "Avoid using visual effects in graphs" (light, shadow, 3D).
- Color has three legitimate jobs on a data display: highlight particular data, group items, encode quantitative values. Anything else is decoration. Same source. https://www.perceptualedge.com/articles/visual_business_intelligence/rules_for_using_color.pdf
- Few also recommends Cynthia Brewer's Color Brewer palettes and the categorical / sequential / diverging split. Same source. https://www.perceptualedge.com/articles/visual_business_intelligence/rules_for_using_color.pdf

### 1.6 Edward Tufte: data-ink, chartjunk, small multiples, sparklines

- Graphical excellence "gives to the viewer the greatest number of ideas in the shortest time with the least ink in the smallest space." Three directives: maximise data-ink, minimise chartjunk, increase data density. https://rmathew.com/2011/visdis.html
- Data-ink: "Above all else, show the data. Erase ink that does not report data." Erase non-data-ink and redundant data-ink. Chartjunk: "Grids, hatching, and figurative objects (ducks) tend to be especially troublesome." Layering: "Give layers hierarchy and levels of detail." Micro/macro: a graphic should read as a whole and in its parts. https://websites.umich.edu/~mmmc/516/notes/TuftePrinciples.pdf
- Six principles of analytical design (Beautiful Evidence): show comparisons; show causality and mechanism; show multivariate data; integrate words, numbers and images (labels next to the data they describe); describe the evidence (sources, scales, provenance); content quality is what the presentation stands or falls on. https://www.antoinebuteau.com/lessons-from-edward-tufte.md
- Small multiples (Envisioning Information, p. 67): "At the heart of quantitative reasoning is a single question: Compared to what? Small multiple designs, multivariate and data bountiful, answer directly by visually enforcing comparisons ... For a wide range of problems in data presentation, small multiples are the best design solution." Identical scales and axes are what make them work. https://en.wikipedia.org/wiki/Small_multiple
- "Comparisons must be enforced within the scope of the eyespan": things you want compared must be on the same screen, side by side. https://kraft.blog/2006/02/envisioning-information-multiples-and-colors/
- Sparklines: "a small intense, simple, word-sized graphic with typographic resolution"; they can go "everywhere a word or number can be: embedded in a sentence, table, headline, map, spreadsheet, graphic." https://www.edwardtufte.com/notebook/sparkline-theory-and-practice-edward-tufte/
- Sparkline rules from the same page: aim for slopes averaging about 45 degrees ("lumpy, not spiky or flat"); add a light gray band for the normal range so deviations jump out; mark min and max with small colored dots; tie the right-hand end of the line to the printed current value; no frames, boxes or backgrounds, let the alignment of numbers and lines form the implicit grid; stack sparklines vertically for "fast effective parallel comparisons" and standardise the scale across a stacked set. Keep line weight and data/background contrast moderate to avoid moire. https://www.edwardtufte.com/notebook/sparkline-theory-and-practice-edward-tufte/
- Tufte's design maxim on sparklines: "max[data], min[design]". https://www.edwardtufte.com/?p=299
- Color (Tufte quoting Eduard Imhof): "Pure, bright or very strong colors have loud, unbearable effects when they stand unrelieved over large areas adjacent to each other, but extraordinary effects can be achieved when they are used sparingly on or between dull background tones." The whole case for a grey base and one accent, in one sentence. https://www.justinobeirne.com/cartography-reading-list and https://docs.os.uk/more-than-maps/geographic-data-visualisation/guide-to-cartography/colour

### 1.7 Nielsen Norman Group on dashboards, charts, alerts and tables

- Dashboards should "leverage human cognition and use length and 2D position to communicate quantitative information quickly." Length and position are "ideal for quantitative representation"; color "should not be used to communicate information about quantitative values or magnitude"; area and angle are preattentive but people cannot "say how much bigger one area is than another." (Page Laubheimer, 2017) https://www.nngroup.com/articles/dashboards-preattentive/
- Chart choices: bar charts (length), line charts and scatter plots (position) are best. "Pie charts and donut charts are notoriously poor at most information-communication tasks." Tree maps suit leisurely exploration, not "simple, actionable dashboards." Gauges "consume a lot of precious space" and are "harder to interpret than linear graphs." 3D "distorts and skews the shapes that represent the data." Use color as a secondary grouping cue, combine it with shape, and remember colorblindness affects "up to 4.5% of the general population." https://www.nngroup.com/articles/dashboards-preattentive/
- Video companion: use visualization styles that work with preattentive processing so overviews are understood "fast and reliably." https://www.nngroup.com/videos/data-visualizations-dashboards/
- Alerts: dashboards that monitor masses of data "should guide users' attention to critical values but not by flashing endless alerts without prioritization." (Alert fatigue, Laubheimer) https://www.nngroup.com/videos/alert-fatigue-user-interfaces/
- Clutter-free charts (Kate Moran, 2022): "Funky colors, fonts, 3D effects, gradients, shadows, and textures don't add informational value"; nobody "should ever use 3D"; when data labels are present, gridlines and the y-axis "are no longer needed"; reduce gridline count by widening the axis step; replace legends with direct labels on the lines (also fixes colorblind reading). Quoting Tufte: graphics should draw attention "to the sense and substance of the data, not to something else." https://www.nngroup.com/articles/clutter-charts/
- Contrast (Moran): use color, titles and callouts to "direct your viewer's attention to your point" and "communicate your key takeaway." One highlighted series, a title that states the finding. https://www.nngroup.com/videos/contrast-charts/
- Tables for data-heavy desktop apps (Laubheimer): a 3-guideline video on big tables; fixed headers and first-column pinning are the standard answers to tables that would otherwise scroll sideways. https://www.nngroup.com/videos/designing-tables-desktop-apps/ (the detailed rules are in the video; general fixed-header / pinned-first-column guidance is summarised at https://medium.com/design-bootcamp/data-table-design-patterns-4e38188a0981)

### 1.8 Apple Human Interface Guidelines and WWDC chart design sessions

- HIG Charts: "Use a chart when you want to highlight important information about a dataset." "Keep a chart simple, letting people choose when they want additional details." Add "brief descriptive text that serves as a headline or summary for a chart" so people "grasp essential information at a glance." "Match the size of a chart to its functionality, focus, and level of detail." A chart "can range from a simple graphic that provides glanceable information to a rich, interactive experience." Make every chart accessible. https://developer.apple.com/design/human-interface-guidelines/charts (text as indexed at https://skillselion.com/skills/raintree-technology/apple-hig-skills/hig-components-content)
- WWDC22 "Design an effective chart": "An effective chart focuses on a few key pieces of information. Design charts with intention." Bars: "Fix the lower bound to 0." Gridlines: "Balance these factors to choose the appropriate density"; use intuitive steps ("multiples of 20", "steps of seven days"); "Some charts don't need grid lines and labels at all" when they are previews. Put the meaning in a heading over the chart, not in tiny axis labels, e.g. "Total Sales: 1,234 Pancakes." Color is "an addition to make the chart easier to understand and not the only means"; balance "saturation and luminosity" so one series does not falsely dominate; support Dark Mode, Light Mode and Increase Contrast. https://nonstrict.eu/wwdcindex/wwdc2022/110340/
- WWDC22 "Design app experiences with charts": charts "should direct attention and provide focus to the most important information." Build a chart design system: small static charts are previews of a larger chart elsewhere ("Static charts rarely exist in isolation"); medium interactive charts add "axis lines and labels so that values can be estimated"; large charts allow "deep investigation." "Progressively reveal chart complexity so that someone can choose the level of information that matches their interest." Moving from preview to detail "should maintain continuity by preserving values, context and state." Every chart gets text that "if read in isolation ... should be informative," e.g. "Sales for the past 30 days are up 12%, totaling 1,234 pancakes." https://nonstrict.eu/wwdcindex/wwdc2022/110342/

### 1.9 Google Material data visualization guidance

- Principles: Accurate ("prioritize data accuracy, clarity, and integrity"), Helpful ("help users navigate data with context and affordances that emphasize exploration and comparison"), Scalable (adapt to device sizes and depth of data). The guidance says dashboards are "a series of multiple charts" and "Multiple, separate charts can sometimes better communicate a story, rather than one complex chart." https://m2.material.io/design/communication/data-visualization.html (page is script-rendered; text as surfaced via search at https://www.typeroom.eu/content/google-rules-six-new-principles-data-visualization-design-follow)
- Material's dashboard section is summarised by practitioners as: establish a clear primary, secondary and tertiary hierarchy; use color with intent, not decoration; let users drill into detail instead of showing it all up front; primary metric and chart title top left, secondary breakdown to the right or below. https://echai.ventures/startingup/from/google-material-design
- Visual structure and uniformity come from consistent "graphical treatments (shape, color, iconography, typography) and interaction patterns (selection, filtering, hover states, expansion)." https://www.typeroom.eu/content/google-rules-six-new-principles-data-visualization-design-follow
- Material dark theme: surfaces are dark grey (#121212) rather than black, because dark grey "increases visibility for shadows and also reduces eye strain for light text"; surfaces get lighter with elevation via semi-transparent white overlays; primary colors are desaturated so they "pass the Web Content Accessibility Guidelines' (WCAG) AA standard of at least 4.5:1" at every elevation. https://m2.material.io/design/color/dark-theme (summary via https://material.io/develop/android/theming/dark). Material 3 replaced elevation overlays with tonal surface colors. https://material.io/blog/tone-based-surface-color-m3

### 1.10 Color, type and theme rules from the working design systems

- Datawrapper (Lisa Charlotte Muth, 2018): "Consider the color grey as the most important color in Data Vis. Using grey for less important elements in your chart makes your highlight colors ... stick out even more." Grey carries context data, unselected states and annotations. "Since grey can seem a bit cold, consider using it with a hint of color: Try a warm grey." No more than seven categorical colors; never a gradient for categories; light for low and dark for high; avoid red with green; contrast ratio at least 2.5 for large text and 4 for small. https://www.datawrapper.de/blog/colors
- Datawrapper (Muth, 2023), emphasising with color: "Gray is a storytelling tool." "Make everything else gray." "The more saturated and darker (on a bright background) the colors, the more attention they'll get." "Don't use a separate hue for de-emphasized data"; use a desaturated or transparent version of the same hue. "If everything is important and emphasized, nothing is." https://www.datawrapper.de/blog/emphasize-with-color-in-data-visualizations
- Datawrapper dark mode (Muth, 2022): dark mode is done by an algorithm "based on color contrast" that keeps the same contrast ratios on a dark background as on white, adjusting chart elements, gridlines, titles, keys, highlight ranges and table heatmaps together; detection via prefers-color-scheme. Lesson: a dark theme is a second full palette, not an inversion. https://www.datawrapper.de/blog/dark-mode-for-embedded-visualizations
- IBM Carbon data-viz palettes: the categorical palette is applied "in sequence strictly as described" and is curated to maximise contrast between neighbours; single-series charts use one color (Purple, Blue, Cyan or Teal); monochromatic sequential palettes flip (darker = larger in light theme, lighter = larger in dark theme); status palette is red (danger), orange (serious warning), yellow (warning), green (success); every swatch has separate light and dark hex values. https://carbondesignsystem.com/data-visualization/color-palettes/
- Type for data (Datawrapper, Muth, 2022): on the web "sans-serif"; choose "fonts with lining and tabular numbers" because "every number is the same width"; oldstyle figures are "hard to read in a table, tooltip, or as an axis tick"; avoid thin weights (they read as a lighter color); bold only for titles and a few emphasised words; text "below 12px will likely be too small." https://www.datawrapper.de/blog/fonts-for-data-visualization
- Dashboard typefaces (fontalternatives.com): the three properties that matter are tabular numerals (font-variant-numeric: tabular-nums), clear glyph differentiation (1/l/I, 0/O), and a tall x-height; Inter is "clear at 11px", Source Sans 3 has the best hinting, IBM Plex Sans has "distinct glyphs, enterprise feel"; "font-size: 13px with line-height: 1.4 typically produces the best density-to-readability ratio"; and "Tabular numerals in a proportional font give aligned columns with better readability than monospace." https://fontalternatives.com/blog/best-fonts-dense-dashboards/
- Inter's OpenType features include tabular numbers (tnum); it has a generous x-height for dense layouts where dashboard text rarely exceeds 14px. https://fontalternatives.com/blog/best-fonts-legible-numerals-ui/ and https://projects.blender.org/blender/blender/pulls/112795
- Geist (Vercel): designed "for developers and designers" on "simplicity, minimalism, and speed," Swiss-influenced, high x-height; Geist Mono is the partner face for code, IDs and numbers. https://vercel.com/font and https://basement.studio/post/the-birth-of-geist-a-typeface-crafted-for-the-web

### 1.11 The academic pattern catalogue (Bach et al., IEEE TVCG 2023)

- "Dashboard Design Patterns" (Bach, Freeman, Abdul-Rahman, Turkay, Khan, Nguyen, Fan, Chen) reviewed 144 dashboards and ran a 2-week workshop; it names eight groups of patterns. https://arxiv.org/abs/2205.00757v1 and https://dashboarddesignpatterns.github.io/patterns.html
- The groups and the choices that matter for Locus: Data information (individual values, derived KPIs, thresholds, aggregates, detail); Meta information (data source, update time, disclaimers, annotations); Visual representation (numbers, trend arrows, "signature charts" meaning small charts without detailed labels, detailed charts with axes, tables); Interaction (exploration, navigation, personalisation, filter and focus); Screenspace (screenfit "fully visible on screen" vs overflow via scrolling vs detail-on-demand vs parameterised); Structure (single page, hierarchical drill-down, parallel pages); Page layout (open, table, stratified top-down, grouped, schematic); Color (distinct, shared, data encoding, semantic, emotive). https://dashboarddesignpatterns.github.io/patterns.html
- The practical reading: Locus should be screenfit for the top layer, hierarchical in structure (overview to platform to detail table), stratified in page layout (most important row on top), with signature charts in tiles and detailed charts only on the drill screens, and a shared color scheme with semantic color reserved for state. https://dashboarddesignpatterns.github.io/patterns.html

### 1.12 The principles, condensed into rules for Locus

1. One screen answers the first question. The top layer of every screen fits without scrolling at 1440 x 900; everything below is detail. (Few, Bach et al. screenfit)
2. Order by the monitoring sequence: overview first, what needs attention second, drill third. (Few)
3. Top left is the most valuable pixel. Put the one number the role cares about there and make it the most salient thing too. (Few via Poynter; Sultanum and Setlur)
4. Every number carries its comparison: a delta vs the compare period, a target marker, or a trend. "Compared to what?" (Few, Tufte)
5. Length and position encode quantity; color encodes category or state only. No pies, donuts, gauges, 3D. (NN/g, Few)
6. Grey base, one accent, semantic red/green only for state, never red beside green without a second cue. (Few rules 3 to 8, Datawrapper, Imhof via Tufte, Carbon)
7. Non-data ink is barely there: thin gray axes, few gridlines, no borders where white space will do, no backgrounds behind data. (Few rule 7, Tufte, NN/g clutter)
8. Sparklines and bullet graphs carry trend and target inside the tile. (Few, Tufte)
9. Small multiples on a shared scale for brands and channels; comparisons inside one eyespan. (Tufte)
10. Progressive disclosure: preview chart in the tile, medium chart with axes on the platform screen, full chart and table on the detail screen, with values and period preserved across the hop. (Apple WWDC22, Material)
11. Label directly, round numbers, tabular figures, nothing under 12px, body at 13px. (NN/g, Datawrapper, fontalternatives)
12. Consistency over variety: one chart style, one tile anatomy, one table anatomy, everywhere. (Few mistake 6, Material uniformity)
13. Alerts are few and ranked; an insight strip, not a flashing wall. (NN/g alert fatigue)

---

## 2. Product teardowns (2024 to 2026)

Sourcing note for this section. Official docs, help centres, changelogs and design-system pages are cited wherever they exist. Third-party "design breakdown" sites (925studios, byq.supply, blakecrosley, hagicode) are reverse-engineered reads of marketing sites and are flagged as such; use their observations about color and hierarchy, not their claims about product behaviour. Triple Whale's marketing site blocks automated fetches, but its knowledge base articles were reachable and are cited directly. Where something could not be sourced it says "not found".

### 2.1 Stripe Dashboard

Layout hierarchy
- Left sidebar is the primary navigation: "the first section of the sidebar is where you can access and act on information related to your balances, transactions, customers, and products" (Home, Balances, Transactions, Customers, Product catalog), then a Shortcuts section of "pinned and most recently visited pages", then Products. https://docs.stripe.com/dashboard/basics
- Home "provides analytics and charts about your business performance. It also surfaces important notifications, like unresolved disputes or identity verifications." It is customisable: "Click Add under Your overview", tick widgets, "Apply"; "Edit" removes. https://docs.stripe.com/dashboard/basics
- Period control is three dropdowns above the charts: a preset or custom date range, a time unit (a one-week range offers daily or hourly; longer ranges offer weeks or months), and "Pick a comparison range". Stripe rounds the unit automatically to fit the range. https://support.stripe.com/questions/dashboard-home-page-charts-for-business-insights and https://support.stripe.com/questions/dashboard-home-charts-overview
- Home charts are explicitly labelled estimates ("estimated information about your account activity"); accounting-grade numbers live in Reports. The split between a fast overview and an exact report is a design decision, not an accident. https://support.stripe.com/questions/dashboard-home-charts-overview
- Trend vs level, in Stripe's own words from the Stripe Apps chart-layout pattern: "Pair charts with headline metrics: Show the current value above the chart so users get the answer before checking the trend", and "This follows the pattern used on the Stripe Dashboard home page. A header with the current value sits above a chart showing the trend." The example is a caption label ("Total revenue"), a bold number ("$33,200"), a second KPI ("Growth +12%"), then a 180px line chart. https://docs.stripe.com/stripe-apps/patterns/chart-layout
- Sizes that match the real Dashboard: 180px chart "Matches the chart area in standard Dashboard metric cards"; 320px "Matches the detail view pattern used in Dashboard analytics pages"; sparklines are "A compact line with no axes or labels" about 24 by 80px beside a KPI. "Don't place more than three charts in a single row. Charts become difficult to read when compressed below roughly 200px wide." https://docs.stripe.com/stripe-apps/patterns/chart-layout
- Chart rules from the same doc: line charts "Zoom the y-axis to make small variations visible"; bar charts "must start at zero" so "Use a line chart if a 100 USD change in 11,000 USD matters"; loading, error, empty and populated states share one fixed height so content below never jumps. https://docs.stripe.com/stripe-apps/patterns/chart-layout
- Drill-down and search: press "?" for keyboard shortcuts; search spans every object type with filters like `amount:>149.99`, `date:last week`, `is:refunded`, negation with `-`, and results grouped by object with "View all". Search terms live in the URL so a search can be bookmarked or shared. https://docs.stripe.com/dashboard/search
- Reports hub: prebuilt Balance and Payout reconciliation reports, scheduled daily/weekly/monthly delivery, custom columns and filters, Sigma for SQL. https://docs.stripe.com/stripe-reports
- AI layer: Sigma Assistant. "Simply type in your question, and the AI-powered Stripe Sigma Assistant will transform it into a query and resulting report"; results can be saved as custom reports in the Dashboard, scheduled, and charted. It lives in the Sigma editor, not on Home. https://stripe.com/sigma
- Mobile: a customisable "Reports overview" home, iOS lock-screen widgets for 17+ metrics and Android home widgets (daily gross volume, new payments, new customers, net volume) plus a daily summary push. https://docs.stripe.com/dashboard/mobile

Visual system
- Light only. A Stripe staffer on the insiders forum said dark mode "isn't a high priority"; third-party extensions fill the gap. https://insiders.stripe.dev/t/dashboard-dark-mode/2473
- Stripe restricts color on purpose: "Custom styling of UI elements is intentionally limited... we limit the colors you can use for each element because color contrast is an important aspect of accessible UI." https://docs.stripe.com/stripe-apps/design
- Stripe Apps tokens that mirror the Dashboard: `caption` and `subtitle` font tokens, `secondary` text color, `surface` nested inside `container` for a layered card, `borderRadius: 'medium'`, spacing `xsmall` to `large`. https://docs.stripe.com/stripe-apps/patterns/chart-layout
- Third-party read (925studios): "Colour is reserved for status signals: green for succeeded, red for failed, yellow for pending"; trends are "monochrome sparklines"; "visual hierarchy is enforced through typography and whitespace, not colour"; each home metric shows "the current period alongside the previous period in smaller text beneath the primary number." Treat as observation only. https://www.925studios.co/blog/stripe-dashboard-design-breakdown
- Official typeface name for the logged-in Dashboard: not found (third-party extractions list Söhne for stripe.com). Tabular figures: not found.

Borrow
- Headline number above a fixed-height chart, compare period as a second small KPI, third dropdown for the comparison range. https://docs.stripe.com/stripe-apps/patterns/chart-layout
- Time unit ladder tied to range length (hourly for a day, daily for a week, weekly or monthly beyond). https://support.stripe.com/questions/dashboard-home-page-charts-for-business-insights
- "Estimates here, exact in Reports" labelling. https://support.stripe.com/questions/dashboard-home-charts-overview
- Shortcuts built from pinned plus recently visited. https://docs.stripe.com/dashboard/basics
- Filter syntax in the search box and search state in the URL. https://docs.stripe.com/dashboard/search

### 2.2 Linear

Layout hierarchy
- The chrome is an "inverted L-shape" (sidebar plus top tab/header strip). The 2024 redesign adjusted "the sidebar, tabs, headers, and panels to reduce visual noise, maintain visual alignment, and increase the hierarchy and density of navigation elements." Headers hold filters and display options; side panels hold properties; views are list, board, timeline, split, fullscreen. https://linear.app/blog/how-we-redesigned-the-linear-ui and https://linear.app/now/how-we-redesigned-the-linear-ui
- Keyboard first: "Press Cmd + K on Mac or Ctrl + K on Windows, then type the page or action you need"; "G" then a letter jumps (G I Inbox, G M My Issues); "/" searches issues, projects and documents; "Press ? to see the full list of shortcuts." https://linear.app/enablement/guides/navigating-linear
- Insights (analytics) is a side panel on any issue view (Cmd Shift I): pick a Measure for the y-axis, a Slice for the x-axis, optionally a Segment for color; segmented bars, scatter, burn-up. Drill-down: "Select full bars or segments to temporarily filter your view to only those issues"; a data table accompanies every graph. https://linear.app/docs/insights
- Dashboards (Enterprise): "Fully modular" layouts of "quick glance metrics" (single numbers), graphs and tables; "Use quick filters to get an instant view of all the underlying issues and immediately take action." https://linear.app/insights
- AI layer: not an insights pane. "Linear for Agents" makes agents assignable users; Triage Intelligence suggests assignee, team, labels and duplicates. https://linear.app/changelog/2025-05-20-linear-for-agents and https://linear.app/ai

Visual system
- Light and dark since day one; presets Ash, Midnight, Dawn, Pale; 70+ community themes. https://linear.app/docs/account-preferences and https://linear.app/docs/custom-themes
- Color is generated in LCH "because LCH has the benefit that it's perpetually uniform"; a whole theme is now three variables, "base color, accent color, and contrast", down from 98; the contrast variable enables "super high-contrast themes." Text and neutral icons were made darker in light mode and lighter in dark. https://linear.app/blog/how-we-redesigned-the-linear-ui
- Typography: "Inter Display to add more expression to our headings while maintaining their readability", regular Inter everywhere else. https://linear.app/blog/how-we-redesigned-the-linear-ui
- Latest refresh: grays moved from a "cool, blue-ish hue" to "warmer gray that still feels crisp, but less saturated"; the sidebar is "a few notches dimmer" so content "take[s] precedence"; "components supporting orientation and navigation should recede"; borders softened, "fewer separators" so structure is "felt not seen"; fewer and smaller icons; "smaller icon-only pills" in the tab bar. https://linear.app/blog/behind-the-latest-design-refresh

Borrow
- Three-variable theming in LCH (base, accent, contrast). https://linear.app/blog/how-we-redesigned-the-linear-ui
- Analytics attached to the list you are already looking at, click a bar to filter. https://linear.app/docs/insights
- The command menu as action runner plus mnemonic G-then-letter navigation. https://linear.app/enablement/guides/navigating-linear
- Dim the chrome, not the content. https://linear.app/blog/behind-the-latest-design-refresh

### 2.3 Vercel Dashboard, Web Analytics, Observability

Layout hierarchy
- 2026 navigation: "New sidebar with horizontal tabs moved to a resizable sidebar that can be hidden when not needed"; "Consistent tabs for unified navigations across both team and project levels"; "Projects as filters so you can switch between team and project versions of the same page in one click." https://vercel.com/changelog/dashboard-navigation-redesign-rollout
- Observability overview: four headline metrics (Edge Requests, Fast Data Transfer, Functions, Compute) and "Each metric also serves as a starting point for deeper analysis, with one-click access to their dedicated dashboards." https://vercel.com/changelog/overview-page-in-observability
- The documented drill flow: pick the feature tab, "Use the date picker or the time range selector", on a chart "Click and drag to select a period of time and press the Zoom In button", then sort the routes list "based on the error rate or the duration", click a route for the function view, which has "a direct link to the logs for that function." https://vercel.com/docs/observability
- Web Analytics: tabs for Visitors, Page Views, Bounce rate; timeframe dropdown "in the top right hand corner"; "panels" below list top entries (Pages, Referrers, Country, Browsers, Devices, OS) "as a number or percentage of the total visitors" with "View All" and CSV export of up to 250 rows. https://vercel.com/docs/analytics
- Custom ranges: "Select any custom time period in the date range picker, or drag across the graph to quickly focus on specific period." https://vercel.com/changelog/filter-by-custom-date-ranges-in-web-analytics
- Compare to previous period in Web Analytics: not found.
- AI layer: Observability Plus "AI query prompting" turns natural language into queries or edits (filters, ranges, grouping) and the prompt "is represented in the URL so they can be shared and bookmarked." https://vercel.com/changelog/ai-query-prompting-now-available-in-observability-plus
- Anomaly layer: configurable anomaly alerts per project, metric, status code and route, with "silence a specific pattern"; Vercel Agent investigations start "automatically when an alert fires" and post the likely root cause as a Slack thread reply. https://vercel.com/changelog/anomaly-alert-configuration-now-available and https://vercel.com/changelog/vercel-agent-investigations-now-in-public-beta
- Command Menu: Cmd/Ctrl K lists shortcuts, arrow keys and Enter jump to a project or team. https://vercel.com/docs/personal-accounts/command-menu

Visual system (Geist)
- Geist is "Vercel's design system for building consistent web experiences": "A high contrast, accessible color system" for light and dark; typography on Geist Sans and Geist Mono with tabular numbers; Materials (radii, fills, strokes, shadows); a Grid that is "a core part of the Vercel aesthetic." https://vercel.com/geist/introduction
- Color: ten scales (`backgrounds`, `gray`, `gray-alpha`, `blue`, `red`, `amber`, `green`, `teal`, `purple`, `pink`), each 100 to 1000; steps 100 to 300 are component backgrounds (default, hover, active), 400 to 600 borders, 700 to 800 high-contrast backgrounds, 900 to 1000 text and icons; two background tokens. https://vercel.com/geist/colors
- Typography roles: Headings (`text-heading-72` down to `-14`), Labels "designed for single-lines, and given ample line-height for highlighting & marrying up with icons" with mono variants for numeric alignment, Copy for multi-line text with higher line height. Tabular numbers are explicit: "Tabular is used when conveying numbers for consistent spacing." https://vercel.com/geist/typography and https://vercel.com/geist/text
- Materials: base and small radius 6px; medium and large 12px; tooltip 6px, menu and modal 12px, fullscreen 16px; depth via shadow and radius more than borders. https://vercel.com/geist/materials
- Typeface: "a typeface specifically designed for developers and designers", Swiss influenced, high x-height; Mono first, then Sans. https://vercel.com/font

Borrow
- Overview tiles that are literally the entry to the dedicated dashboard. https://vercel.com/changelog/overview-page-in-observability
- Drag-to-zoom on the chart, then a sortable table underneath. https://vercel.com/docs/observability
- Top-N panels with percent of total, "View All" and export. https://vercel.com/docs/analytics
- Label vs Copy type roles and tabular numerals for data. https://vercel.com/geist/text

### 2.4 Mercury

Layout hierarchy
- First thing on login is the "Mercury balance", "a birds eye view of available funds across all of your checking, savings, and (if applicable) Treasury accounts, including any pending transactions" (support article; page blocks automated fetch, text from search summary). https://support.mercury.com/hc/en-us/articles/28767842120852-Understanding-your-Mercury-balances
- Transactions page: "two real-time charts at the top: a cashflow graph showing money movement over time (default view is current month), and a money movement breakdown displaying top five sources of inflows and outflows", then a spreadsheet-style table with sort and group via Customize, one-click filters by "date, keyword, or amount", advanced filters, and saved views named after questions (My Transactions, Monthly Money In, Monthly Money Out). Framed as "How much did we burn this month? Where's most of our spend going?" https://mercury.com/blog/updated-transactions-page
- Mercury Command "is found in the top left corner of your Mercury dashboard, and also via float button in the bottom right" (search summary; page blocks fetch). https://support.mercury.com/hc/en-us/articles/50304702652436-Mercury-Command-overview
- Mercury's own framing of Home: "the home base of Mercury and the connective tissue between everything you need: home, search, tasks, notifications, and the moment-to-moment sense of place and priority." https://www.workingnomads.com/jobs/senior-product-manager-dashboard-experience-mercury-1814920
- Third-party read (925studios): "Financial position (account balance, recent transactions, cash flow) at the top level", "Operational controls... one level down"; the logged-in product is dense and "can feel like being dropped into a cockpit without a briefing." https://www.925studios.co/blog/mercury-design-breakdown

Visual system
- Dark, Light or System under profile > Appearance (search summary). https://support.mercury.com/hc/en-us/articles/37538153196948-Enabling-dark-mode
- Third-party extractions of the marketing site: Arcadia Sans for UI, Arcadia Display for headings, Tiempos Headline serif for "brand voice moments"; light tokens canvas #fbfcfd, surface #ededf3, text #272735, brand blue #5266eb; card radius 16px, 32px card padding. https://app.byq.supply/styles/brand/mercury
- Dark hero tokens (third party): background rgb(15,15,20), border rgba(255,255,255,0.08), credit green, debit red, pending amber; "Financial data: 28px size, 500 weight, -0.5px tracking." https://blakecrosley.com/guides/design/mercury
- Color discipline (925studios): green primary, blue secondary, "Red and yellow appear only for errors and warnings", "No aggressive accent colors". https://www.925studios.co/blog/mercury-design-breakdown
- Official Mercury design-team documentation: not found.

Borrow
- One big balance first, then per-account rows and a money-movement menu. https://support.mercury.com/hc/en-us/articles/28767842120852-Understanding-your-Mercury-balances
- Two charts above a spreadsheet-grade table with saved views named after questions. https://mercury.com/blog/updated-transactions-page
- Command entry in two places (top left and a floating button). https://support.mercury.com/hc/en-us/articles/50304702652436-Mercury-Command-overview

### 2.5 Grafana

Layout hierarchy
- A 24-column grid: "the width of the dashboard is divided into 24 columns", height units "each represents 30 pixels", and "The grid has a negative gravity that moves panels up if there is empty space above a panel." https://grafana.com/docs/grafana/latest/dashboards/build-dashboards/view-dashboard-json-model/
- Time picker top right: relative, absolute or semi-relative ranges, zoom out, drag on a chart to zoom in, auto-refresh with an interval tied to range and window width. https://grafana.com/docs/grafana/latest/dashboards/use-dashboards/
- Compare period is a per-panel setting: a drawer with panel time range, time shift and Time comparison ("Day before, Week before, Month before, or a custom offset"), shown in the panel header; GA in 13.3. Delta color is a choice: Standard ("An increase is shown in green"), Inverted ("An increase is shown in red"), or Same as value. https://grafana.com/whats-new/2026-09-24-panel-time-settings-and-time-comparison-are-now-generally-available/
- Stat panel: "displays your data in single values of interest, such as the latest or current value of a series"; graph mode "Area" draws "a small time-series graph shown in the background of each value"; color modes None, Value, Background Gradient, Background Solid; "Show percent change"; "Wide layout is enabled by default" with value and name side by side; thresholds recolor the value. https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/stat/
- Best practices: "Hierarchical dashboards with drill-downs to the next level"; "What story are you trying to tell with your dashboard?"; "one row per service" ordered by flow; use template variables instead of duplicate dashboards; "Periodically review the dashboards and remove unnecessary ones." https://grafana.com/docs/grafana/latest/dashboards/build-dashboards/best-practices/
- AI layer: Grafana Assistant "appears in a sidebar and stays open as you navigate the UI"; "the context for the current view is fed to the agent"; it builds and edits dashboards, runs investigations and navigates you to the data. https://grafana.com/blog/llm-grafana-assistant/

Visual system
- Dark by default: "By default, the UI theme is set to dark mode", overridable per org, team or user. https://grafana.com/docs/grafana/v13.1/administration/organization-preferences.md
- Saga design system ships dark and light component libraries; principles Universal, Accessible, Flexible, Coherent, Defined, Distinct. https://grafana.com/blog/saga-design-system-shaping-the-future-of-user-experiences-at-grafana-labs and https://grafana.com/developers/saga/about/overview/
- Time series defaults: gradient "None. This is the default setting"; legend list; tooltip single or all. https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/time-series/
- In-app typeface: not found (Saga typography page 404).

Borrow
- Stat tile with the sparkline behind the number, auto-hidden when the tile gets small, plus a percent-change line. https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/stat/
- Comparison offset surfaced in the panel header, with user-chosen delta polarity for low-is-good metrics. https://grafana.com/whats-new/2026-09-24-panel-time-settings-and-time-comparison-are-now-generally-available/
- 24-column grid, 30px rows, gravity. https://grafana.com/docs/grafana/latest/dashboards/build-dashboards/view-dashboard-json-model/

### 2.6 Amplitude

Layout hierarchy
- Chart builder: "Guided, top-down structure with a linear flow", "Side-by-side view with controls on the left and the chart on the right enables instantaneous feedback", "Progressive disclosure where less-frequently-used functionality is tucked away." Motivation: controls used to "span the entire screen and bump the chart off the bottom of the page." https://www.amplitude.com/blog/evolution-of-amplitude-charts
- Dashboards: "there is a max of 4 items per row"; drag an item into a row and it auto-fits; resize by dragging the gap between items. https://community.amplitude.com/discussion/6524/decease-chart-width-button-where-did-it-go
- Dashboard-wide period: presets "last seven days, 30 days, 60 days, or 90 days" or a picker, an interval dropdown, property filters; "A dashboard filter applies a date range, interval, property, or saved segment across all of a dashboard's charts"; "Copy URL" shares the state. https://amplitude.com/docs/analytics/dashboard-filter
- Compare to past is "in the top-right of the chart, near the date picker"; presets previous day/week/month/quarter/year, custom with a Rolling toggle; "compare up to two previous periods at the same time"; absolute vs percentage change. https://amplitude.com/docs/analytics/charts/event-segmentation/event-segmentation-interpret-2
- Anomaly layer: an "Anomaly + Forecast" button on the chart ("The button turns orange when you engage the feature"), Prophet-based, 99% confidence interval, agile/robust/custom. https://amplitude.com/docs/en/analytics/anomaly-forecast
- Alerts: automatic, smart (outside the confidence interval) and custom, delivered "by 8:00 AM in the project's timezone" or Slack, linking to the chart with the issue in a side panel. https://amplitude.com/docs/en/analytics/insights
- AI layer: Global Agent via "Floating button, Chat in the left nav, or Cmd/Ctrl+Shift+K"; a Dashboard Agent returns "a layout of charts and KPIs to refine, not a blank canvas"; Ask Amplitude sends only the conversation, not customer data, to the model. https://amplitude.com/docs/amplitude-ai/agents-overview and https://amplitude.com/docs/analytics/ask-amplitude
- Retention: chart plus a breakdown table whose first row is overall retention and later rows are per cohort per period. https://amplitude.com/docs/analytics/charts/retention-analysis/retention-analysis-interpret

Visual system
- Light UI; dark mode: not found. Brand type is Gellix (display) and IBM Plex (body); the in-app font is not documented. https://brand.amplitude.com/visual-direction/typography

Borrow
- Controls left, chart right, live feedback. https://www.amplitude.com/blog/evolution-of-amplitude-charts
- Up to two comparison periods with rolling and absolute/percent toggles. https://amplitude.com/docs/analytics/charts/event-segmentation/event-segmentation-interpret-2
- Anomaly band as a toggle on the chart itself. https://amplitude.com/docs/en/analytics/anomaly-forecast

### 2.7 Mixpanel

Layout hierarchy
- 2025 navigation: the top bar was removed "to give you more space to work"; a persistent left panel with project switching, create, search and quick links on top, Boards in the middle (Pinned, Favorites, Your Boards), settings at the bottom; a shortcut collapses it. https://docs.mixpanel.com/changelogs/2025-04-16-global-sidenav
- Boards: rows of up to four cards; cards snap to twelfths with a quarter-width minimum; row height follows the tallest card; card types are Reports, Text and Media. "Choosing any other date range at the Board level sets all reports on that Board to use the same date." Temporary filters for exploring; Pinned Filters for permanent changes. Subscriptions send "the 8 reports that are on the top of a board"; TV Mode refreshes every 10 minutes. https://docs.mixpanel.com/docs/boards
- Insights visualizations: aggregate views (Bar, Stacked bar, Pie, Metric big number, Table) and time views (Line default, Stacked line, Column, Stacked column); Compare to past offers previous period or year, with the comparison window always matching the current window's length; weekend points shifted to Monday so lines align; click a segment to see the underlying users. https://docs.mixpanel.com/docs/reports/insights
- Retention table: rows are cohorts, columns successive periods; "each box within a row is assigned a shade of purple. The shading gets darker the higher the retention percentage"; in-progress periods marked with an asterisk; the curve view "always includes both a line chart and a table." https://docs.mixpanel.com/docs/reports/retention
- AI and anomaly layer: Anomaly Detection alerts on Prophet confidence intervals; Root Cause Analysis outputs a Board with an "Interpretation card" on top ("the AI's written explanation, confidence level, and suggested next steps"), one card per ranked dimension, and "a live progress banner at the top while the agent is still working." Spark/Agent builds "the right report... complete with the corresponding chart" that is "viewable and editable like any other report." https://docs.mixpanel.com/docs/root-cause-analysis and https://mixpanel.com/blog/spark-bringing-generative-ai-to-mixpanel/

Visual system
- Light default; dark mode opt-in since 2021 via the settings cog, palette "passed WCAG Level AA standards in as many places as possible." https://mixpanel.com/blog/dark-mode-in-mixpanel-is-here/
- Typography, chart defaults: not found.

Borrow
- Twelfths grid, quarter minimum, four per row. https://docs.mixpanel.com/docs/boards
- Temporary vs pinned filters. https://docs.mixpanel.com/docs/boards
- AI explanations rendered as ordinary cards on a board, with a progress banner. https://docs.mixpanel.com/docs/root-cause-analysis

### 2.8 PostHog

Layout hierarchy
- "PostHog 3000": "PostHog should feel less like a generic SaaS app and more like a dev tool." Two nav groups (Project and data; Products), collapsible labels, a right-side panel for Notebooks, docs and support, command palette on Cmd Shift K; benchmarks were Figma, VS Code and Linear. Density went up: "you can now see more information on the screen", smaller text instead of large titles, fixed panels instead of full-page scrolls. https://posthog.com/blog/posthog-as-a-dev-tool
- Dashboards: grid; "resize tiles directly without entering edit mode" via edge handles; "Edit layout" (press E) for drag and drop; text cards; dashboard-wide date range override, with "tile-level filters take precedence"; templates; public links and embeds with "light, dark, or system" themes. https://posthog.com/docs/product-analytics/dashboards
- Trends display types: time series (Line, Line cumulative, Bar, Area, Box plot) and total value (Number, Bar, Table, Pie, World map, Calendar heatmap). Number tile: "Enable Compare to previous period to show a percentage change pill"; Table: "comparison values appear in a dedicated column next to the current values." https://posthog.com/docs/product-analytics/trends/charts
- AI layer: PostHog AI (Max) via "a chat sidebar in the PostHog web app, with inline entry points throughout the UI"; "Ask it a question in plain English and it queries your data, builds the insight, writes the SQL"; it also "edits filters in the UI alongside you." https://posthog.com/docs/max-ai

Visual system
- Dark mode shipped with 3000: light, dark, or system; light mode uses "the highly-acclaimed controversial PostHog tan." https://posthog.com/blog/posthog-as-a-dev-tool
- Design philosophy: "we maintain a design system in Storybook so engineers can build high-quality features independently." https://archive.posthog.com/handbook/brand/philosophy

Borrow
- Dev-tool density: smaller type, fixed panels, collapsible labels, a right utility panel. https://posthog.com/blog/posthog-as-a-dev-tool
- Number tile with a percent-change pill; table with a comparison column. https://posthog.com/docs/product-analytics/trends/charts
- An assistant that edits the live filters next to you. https://posthog.com/docs/max-ai

### 2.9 Northbeam

Layout hierarchy
- Overview Home Page is the landing screen, "built to visualize the KPIs that are most important for your brand"; tiles you can "create or rearrange ... to showcase KPIs like ROAS, CAC, and transaction data"; views can be renamed, saved and shared. https://docs.northbeam.io/docs/overview-page
- The global filter bar on Overview carries attribution model (Clicks-Only, First Touch, Last Touch, Last Non-Direct Touch), attribution window (1-day click through 90-day click plus lifetime), accounting mode (Cash Snapshot vs Accrual Performance), granularity (monthly, weekly, daily), time period and time comparison (previous period, same period prior year, custom). Recommended defaults: Clicks-Only, 1/7/30-day windows, Cash Snapshot, weekly, previous period. https://docs.northbeam.io/docs/overview-page.md
- Northbeam 2.0: the top navigation "clearly shows your selected model, accounting mode, and lookback window at all times," with "Quick Preserved Custom Views" one click away (page sits behind login; text from search summary). https://docs.northbeam.io/v2.3/docs/northbeam-2-update
- Sales page is "the most utilized page on Northbeam" and "Your hub for day-to-day decisions": a chart "that shows each of your channels as well as the key metrics associated with each one," a customisable table (Spend, Revenue 1st Time, ROAS 1st Time, New Customers, CAC 1st Time) and drill through "Campaign level, Adset level, and even Ad level"; "This view is similar to the UI that you typically see inside your ad manager platforms." https://docs.northbeam.io/docs/sales.md and https://docs.northbeam.io/docs/navigating-northbeam
- "The percent change insight at the bottom of each box is based on the option you selected in the Time Period filter at the top right": the delta lives inside each KPI box, the comparison control lives once, top right (search summary; direct fetch 404). https://northbeam.io/post/using-the-sales-page
- Accounting modes: Cash Snapshot ("Attribute Credit to the Day of the Transactions", for reporting) vs Accrual Performance ("Attribute Credit to the Day of the Interaction", for daily optimisation); Accrual is the default on Overview and Sales. https://docs.northbeam.io/docs/accounting-modes.md
- Attribution models with usage guidance: Clicks-Only is "Great for day-to-day decision making. This will be more conservative"; Last Non-Direct Touch "great for monitoring Bottom of Funnel performance." https://docs.northbeam.io/docs/attribution-models.md
- Dashboard design guidance: "Out of the box, Northbeam shows you everything. Design the views that match how your team actually talks about the business"; "Pick the attribution model, window, and accounting mode your team reports on, and keep them stable"; "Set up a dashboard per storefront." https://docs.northbeam.io/docs/journey/design-your-dashboard.md
- Creative Analytics: "creative cards" with preview and metrics; "Sort by Spend (top-down)"; "Metrics are displayed on a sliding scale from Red (negative) to Green (positive)"; "Select up to 6 ads by clicking the checkbox labeled Show in charts" to compare as lines or bars; "Hide Inactive Ads." https://docs.northbeam.io/docs/creative-analytics.md
- Metrics Explorer: tiles with a purple-highlighted primary metric and correlation scores and labels ("Strong Positive") on every other tile; "a modular customizable dashboard to run these correlations." https://docs.northbeam.io/docs/metrics-explorer.md
- Profit Benchmarks: "See your performance against benchmarks in real-time ... Scale winners and cut underperformers at a glance." https://www.northbeam.io/features/profit-benchmarks

Visual system
- Theme, typography, chart style: not found. Documented color: the red-to-green sliding metric scale and the purple primary-metric highlight. https://docs.northbeam.io/docs/creative-analytics.md
- A Capterra reviewer: "Some of the visual design is still being refined"; ease of use 3.5 of 5; "It can feel overwhelming at first because there's so much data and customization." https://www.capterra.com/p/10003962/Northbeam/
- The model "is a black box ... it does not give you a transparent view of how it arrived at those numbers." https://ecommercefastlane.com/northbeam-review/

Borrow
- The persistent lens readout (model, accounting mode, window) in the top bar. https://docs.northbeam.io/v2.3/docs/northbeam-2-update
- Saved, named, shared views as the unit of customisation. https://docs.northbeam.io/docs/overview-page
- One comparison control feeding a delta inside every box. https://northbeam.io/post/using-the-sales-page
- "Show in charts" checkboxes to overlay up to six creatives. https://docs.northbeam.io/docs/creative-analytics.md

### 2.10 Hyros

- Reports are generated, not browsed: Reporting > Reports, pick an attribution mode (Last Click, Last Click by date of click, Scientific which "merges First and Last Click attribution"), set range and filters, "hit Generate Report." https://docs.hyros.com/?p=734
- The new workspace drops the top nav: "we've consolidated key controls into the left sidebar," a "modern boxed layout," and multiple reports open as tabs with "tab order and report names saved across sessions" so you can "compare reports, test attribution models, and explore multiple data views at the same time." https://hyros.com/updates/power-features/a-faster-smarter-hyros-workspace/
- The announced redesign adds two modes: "Basic View: Clean, simple stats at a glance. No clutter, no confusion" and "Pro View: Full power-user mode. Custom widgets, advanced dashboards"; reports load "your last viewed report (default: last 7 days)" in a "Facebook-ads-style layout" with "Fewer sidebar options." https://hyros.com/updates/blog-news/major-updates-major-ui-ai-and-reporting-enhancements-coming-soon/
- Homepage: ad-level tables comparing platform-reported vs Hyros-detected sales, a weighted model ("First touch 20% Assists 30% Last touch 50%"), an LTV dashboard by channel ("90-day LTV, $412, Payback, 34 days"), and a Claude MCP for "which ads should we cut and which should we scale based on LTV?" https://hyros.com/
- Call tracking as report columns (booked calls, closes, revenue per ad) and Hyros revenue pushed back into Meta and Google as extra columns. https://hyros.com/call-tracking
- Changelog: 2.6.5 "Major UI Refresh Across the App"; 2.6.6 "Creatives Report: Deep Mode Now Available in Gallery View"; 2.6.7 scheduled emailed dashboard reports. https://hyros.com/blog/changelog
- Theme and typography: not found. Criticism: "Navigating the detailed software interface can initially be a bit confusing"; a "3 to 6 month onboarding period before attribution data is reliable"; but reports "are often much clearer and more focused than the overloaded dashboards of the advertising platforms." https://www.trustpilot.com/review/www.hyros.com , https://thegtmdirectory.com/tools/hyros/md , https://ecom-tools.de/en/hyros/
- Borrow: persistent report tabs for side-by-side models; the Basic vs Pro toggle as the answer to "too many numbers"; attribution mode as an explicit, printed report parameter. https://hyros.com/updates/power-features/a-faster-smarter-hyros-workspace/ and https://hyros.com/updates/blog-news/major-updates-major-ui-ai-and-reporting-enhancements-coming-soon/

### 2.11 Triple Whale

Layout hierarchy
- Left sidebar in three zones: business selector on top (multi-select to blend businesses); Moby 2 in the middle with an "Ask Anything" bar, History, Automations, Favorites and Search, then "Core Workspaces" (Summary, Marketing Acquisition, Creative Analysis, Website Conversion, Customer Retention, Discovery) and custom workspaces; Data, Help and Settings at the bottom. https://kb.triplewhale.com/en/articles/12117524-a-guide-to-triple-whale-s-navigation
- Summary page: sections grouped by data source (Pinned, Business/Store, each marketing channel such as Meta, Google, Klaviyo, Web Analytics from the Pixel, Custom Expenses). Each tile shows the current value, a delta percent and a sparkline over the selected range; hover the sparkline for the trend; click a tile and it "opens a bar graph view with comparison data with the previous time period." Pin tiles to the Pinned section; "Edit Dashboard" moves sections and resizes tiles; a section can pivot to a table view. https://kb.triplewhale.com/en/articles/5725275-track-kpis-with-the-summary-dashboard
- Filters live inside the relevant section (store filters in Business, ad filters per integration), use AND logic, and leave "an indicator in the dashboard navigation" while active. https://kb.triplewhale.com/en/articles/9713302-filter-data-on-the-summary-dashboard
- Custom dashboards: name, folder, optional locked date range; content from Moby ("ask questions in plain language ... and add those metrics and insights right to the dashboard"), a Metric Library table builder, or custom SQL; widget menus "reorganize or hide columns, change the format of numerics, and add conditional styling." https://kb.triplewhale.com/en/articles/9653103-create-a-custom-dashboard and https://kb.triplewhale.com/en/articles/9659653-editing-a-custom-dashboard
- Attribution dashboard: a Columns button top right with nine preset column sets (Default, Paid Performance, Traffic, New Customers, and so on) and "Save as new preset"; seven attribution models (First Click, Last Click, Total Impact, Clicks and Deterministic Views, Triple Attribution, Triple Attribution + Platform Views, Linear); default window 28 days. https://kb.triplewhale.com/en/articles/8143690-customizing-your-attribution-dashboard and https://kb.triplewhale.com/en/articles/5960333-understanding-and-utilizing-attribution-models
- Benchmarks appear "below the attribution chart" as cards and as "an inline comparison ... added to your attribution table": your value, the peer median and a rank badge ("Top 25%, Average, or Bottom 25%"); a chevron opens a distribution chart with a "You" marker; toggled off "in the date picker." https://kb.triplewhale.com/en/articles/15483220-benchmarks-see-how-your-business-stacks-up-against-brands-like-yours
- Creative Analysis: an "Ads Comparison Area" with Card, Bar and Line views, a "Table Deep Analysis" for large row counts, grouping by Ad Name, Image ID, Video ID, Copy and Segments, unified Filters and saved Presets. https://kb.triplewhale.com/en/articles/6362638-analyze-creative-performance-with-the-creative-analysis-dashboard
- Moby: natural-language questions with tabular answers, a history tab, export and in-thread comments; report building is a split-screen chat with live preview; "Create a visual report with insights" yields a Gen UI report that can be shared or converted "to an Agent" for scheduled runs. https://kb.triplewhale.com/en/articles/9211940-moby-introduction and https://kb.triplewhale.com/en/articles/11151399-building-reports-with-moby
- Moby inside dashboards: "Add New Section" takes a plain-language description, Moby "understands metrics, timeframes, breakdowns, and visual types," shows a preview and you "Approve & Add"; "Nothing is added automatically." https://kb.triplewhale.com/en/articles/13038950-create-dashboard-widgets-with-moby
- Moby Observability: anomaly detection (Isolation Forest against history) three times a day on the last full hour, threshold monitoring for known ranges, and an AI root-cause analysis when a metric is flagged. https://kb.triplewhale.com/en/articles/12986027-moby-observability
- September 2026: chat with Moby directly from Summary and Attribution "without leaving your analysis"; a rebrand (Sept 8, 2026); Compass (attribution, MMM and incrementality with daily recommendations); Sonar (data enrichment). "Triple Whale 2.0" as a product name: not found; the real names are Moby 2, Compass, Sonar. https://www.triplewhale.com/blog/triple-whale-product-updates-sept-2026 , https://www.triplewhale.com/blog/triple-whale-rebrand , https://www.triplewhale.com/compass , https://www.triplewhale.com/sonar

Visual system
- Light interface; dark mode in the app: not found (only Gen UI reports offer "themes (light, dark, brand-inspired)"). https://www.triplewhale.com/ and https://kb.triplewhale.com/en/articles/13042041-create-a-gen-ui-report-from-your-dashboard
- Tile anatomy: value plus delta percent plus sparkline; click opens bars vs previous period. https://kb.triplewhale.com/en/articles/5725275-track-kpis-with-the-summary-dashboard

Criticism
- "The app is okay, but it's full of bugs and the UI is terrible. Modifying reports or navigating menus is a cluster"; "for a small operation it's just way overload"; "The same bad UI interface has been active for years." https://apps.shopify.com/triplewhale-1/reviews?ratings%5B%5D=1&ratings%5B%5D=2&ratings%5B%5D=3
- "Triple Whale was really awesome when it started because it was simple and clear and powerful. Now it's confusing af and essentially just as convoluted as Google Analytics." https://campaignbuyer-com-independent-review-21cd19.gtm.elasticfunnels.io/reviews/triple-whale
- "Moby 2 kept crashing whenever I pulled complex segments on heavy traffic days"; credits run out fast; "all performance data in one clear, real-time dashboard makes our daily work so much easier." https://www.trustpilot.com/review/triplewhale.com
- "the Summary Page is intuitive from day one, but Moby automations, Sonar configuration ... and custom dashboard builds require meaningful time investment." https://ecommercefastlane.com/triple-whale-review/
- Locus-side lesson (team memory "Triple Whale traps"): the attribution model and window must be printed beside the date picker and on the report; Northbeam's docs say the same. https://docs.northbeam.io/docs/journey/design-your-dashboard.md

Borrow
- Pinned section at the top of Summary with a pin on every tile; click a tile to open bars vs previous period without navigating away. https://kb.triplewhale.com/en/articles/5725275-track-kpis-with-the-summary-dashboard
- Column presets with "Save as new preset." https://kb.triplewhale.com/en/articles/8143690-customizing-your-attribution-dashboard
- Benchmark rank badge with a chevron to the distribution. https://kb.triplewhale.com/en/articles/15483220-benchmarks-see-how-your-business-stacks-up-against-brands-like-yours
- AI widget creation with preview and explicit "Approve & Add." https://kb.triplewhale.com/en/articles/13038950-create-dashboard-widgets-with-moby
- Filter-active indicator in the navigation. https://kb.triplewhale.com/en/articles/9713302-filter-data-on-the-summary-dashboard

### 2.12 Polar Analytics

- Dashboards hold two block types: "Key Indicator Sections," which are "grids of metrics that you want to keep a close eye on" with targets, and Tables/Charts; dashboards live in Folders; Views apply different filters to one dashboard instead of duplicating it. https://intercom.help/polar-app/en/articles/10430437-understanding-dashboards
- Custom Dashboards 2.0 splits indicators into "Metric Cards" (single value, no trend) and "Sparkline Cards" ("a small trend chart"), both with custom filters and "locked date ranges," arranged in "Card Grids"; comparisons can be added "directly to charts"; chart styles include stacked bar, 100% stacked, area, mixed bar plus line. https://intercom.help/polar-app/en/articles/14472426-custom-dashboards-2-0
- Six visualization types: Metric Cards, Sparkline Cards, Line, Bar, Pie, Table; all follow the date range and support comparison to previous periods or years. https://intercom.help/polar-app/en/articles/6928284-how-to-visualize-your-data-in-polar
- Date filter: presets, relative ranges ("last 180 days"), custom, plus daily/weekly/monthly aggregation. https://intercom.help/polar-app/en/articles/5973046-how-can-i-use-date-filters
- Comparison in tables shows "the % change in the same cell, with a tooltip to see the previous absolute value," with an optional previous-value column. https://intercom.help/polar-app/en/articles/10651354-seeing-historical-values-with-the-comparison-feature
- Every Key Indicator has an "i" hover showing its formula. https://intercom.help/polar-app/en/articles/5649166-how-are-my-metrics-calculated
- Color Scales on tables: red, green or purple gradients "between lighter and darker shades based on the value's position," modes Above/Below a Value, Relative to Another Metric, Outside a Range. https://intercom.help/polar-app/en/articles/8574927-customizable-color-scales
- Ask Polar 2.0 opens "from the top navigation bar," returns "bar charts, line graphs, and tables directly in Polar" inline in chat, and any answer can be popped out and saved to a dashboard; Smart Alerts and an AI Operator in Slack that "manages ad budget shifts and pauses." https://intercom.help/polar-app/en/articles/13017453-ask-polar-2-0 and https://polaranalytics.com/business-intelligence
- Positioning: "the AI data platform for commerce," one warehouse across "Shopify, Amazon, Meta, Google, TikTok, Klaviyo and more," "10 powerful attribution models," "see the definition behind every number"; from $750/month. https://apps.shopify.com/polar-analytics
- Visual system: "a modern interface with light backgrounds and clean typography"; reviewers call it "sleek and uncluttered"; dark mode: not confirmed in docs (the marketing site lists it). https://www.polaranalytics.com/ and https://bloggle.app/app-reviews/polar-analytics-review
- Criticism: lag "switching between different views and reports"; limited mobile; steep learning curve; sales call required before trial. https://bloggle.app/app-reviews/polar-analytics-review and https://apps.shopify.com/polar-analytics/reviews?ratings%5B%5D=1&ratings%5B%5D=2&ratings%5B%5D=3
- Borrow: Metric Card vs Sparkline Card as two explicit tile types; percent change in the cell with the absolute value on hover; formula on hover; Views instead of cloned dashboards; AI answers that pop out into a saved report. https://intercom.help/polar-app/en/articles/14472426-custom-dashboards-2-0 , https://intercom.help/polar-app/en/articles/10651354-seeing-historical-values-with-the-comparison-feature , https://intercom.help/polar-app/en/articles/13017453-ask-polar-2-0

### 2.13 Lifetimely (by AMP)

- The profit dashboard is the landing screen ("revenue, product costs, marketing costs and your net profit"); custom dashboards use "drag-and-drop modules." https://1800dtc.com/breakdowns/lifetimely
- Income statement: four header numbers (Net sales, Marketing costs, COGS, Net profit) above line-item sections, each with an "i" definition. https://help.useamp.com/article/687-income-statement-walkthrough
- LTV cohort table (the triangle): "each row represents a cohort"; left columns summarise New customers, CAC, Repeat Rate; right columns accumulate value by month. "Solid navy blue cells represent your actual accumulated sales," "Striped light blue cells extend your cohorts forward in time" (predictions), and "A green vertical line appears on the timeline when a cohort's gross margin ... exceeds its Customer Acquisition Cost." A toggle shows a "spaghetti chart" with one line per cohort. https://help.useamp.com/article/1124-ltv-cohort-report-overview
- Predictive LTV projects "up to 24 months," with an "LTV Averages" strip at 3, 6, 12 and 24 months; hover a cell to see "whether it's historical or predictive." https://help.useamp.com/article/641-predictive-ltv-walkthrough
- Cohort Breakdown report: segment and new-customer columns on the left, Month 0 and later months on the right, repurchase rate and growth percentages, header tooltips, per-segment AI insight icons. https://help.useamp.com/article/1125-cohort-breakdown-report-overview
- Sales Breakdown: line items with a comparison dropdown "against a previous period (shifting identical days back dynamically) or a custom historical range," deltas "side-by-side." https://help.useamp.com/article/1368-sales-breakdown-report
- Anomaly detection: a 7-day rolling average on ad spend, conversion rate and revenue; the chart "automatically highlights the four most recent anomalies with clear flags," with a list that drills to campaign level. https://help.useamp.com/article/1049-anomaly-detection-walkthrough
- Profit Agent: "your always-on analyst inside Lifetimely," surfaced in a Command Center with proactive insights, Slack mentions, scheduled reports and an Action History log. https://help.useamp.com/article/1414-profit-agent-full-capabilities-overview
- Custom metrics carry a "trend direction (positive or negative)" so green and red are always right. https://help.useamp.com/article/1090-custom-metrics-walkthrough
- AMP's current positioning: "monitors profit, acquisition, retention, products, and customer behavior, then explains where profit is growing or leaking and recommends the next move"; Detect, Explain, Decide. https://useamp.com/products/analytics
- Theme and typography: not found. Criticism: "Very basic and slow," "far too expensive"; P&L distorted by post-purchase upsells; data refreshes "every few hours rather than in true real-time"; "clunky on mobile." https://apps.shopify.com/lifetimely-lifetime-value-and-profit-analytics/reviews?ratings%5B%5D=1&ratings%5B%5D=2&ratings%5B%5D=3 and https://www.attnagency.com/blog/lifetimely-shopify-review
- Borrow: actual vs predicted cells visually distinct (solid vs striped) with a payback marker in the grid; four header numbers above a line-item P&L; anomaly flags on the trend chart capped at the four most recent; trend direction stored on the metric definition. https://help.useamp.com/article/1124-ltv-cohort-report-overview , https://help.useamp.com/article/687-income-statement-walkthrough , https://help.useamp.com/article/1049-anomaly-detection-walkthrough , https://help.useamp.com/article/1090-custom-metrics-walkthrough

### 2.14 Motion (creative analytics)

- Report builder: Create Report, pick Top Performing, then three controls: date range, performance filters (naming-convention filters and thresholds such as "Spend > $1,000 AND ROAS > 2.0"), and grouping (Creative ID, Ad Name, copy, headline, landing page). Three visualizations: Line Chart (trends, "Creative fatigue"), Bar Chart, and Tile View ("Display creative thumbnails with up to 6 metrics" with drag-to-reorder metrics). https://help.motionapp.com/en/articles/7090459-how-to-build-a-report
- Page anatomy: a bar chart with ad thumbnails along the x-axis, "Add filter" and "+ Add metric" controls, a left folder tree of reports, Share report and CSV export top right. https://motionapp.com/library/talk/how-reports-work-tips-tricks-in-motion/
- Reports default to "grouping by Creative, which aggregates performance across ad sets and campaigns based off the creative ID"; "Add performance filters to remove low-spend creatives"; three report types (Launch, Top performing "your workhorse", Comparative analysis). https://help.motionapp.com/en/articles/8757186-how-reports-work-tips-tricks-in-motion
- Comparative reports: "group your ads by common elements and spot performance patterns"; "each group ... in the bar chart with its performance data," a table below, click a group to open its ads; "Create top performing report" for a winning group. https://help.motionapp.com/en/articles/8757626-identify-creative-trends-with-comparative-reports
- The table sits "below the main graph"; metrics must be in the table before they can be charted; column sets save as presets. https://help.motionapp.com/en/articles/7843087-editing-your-table-chart-metrics-and-creating-presets
- Period over period: current, previous and percent change "color-coded green for increases, red for declines"; Card view shows each creative's metrics plus change; Table view gives "Every metric ... its own comparison columns"; Meta only. https://help.motionapp.com/en/articles/13454813-period-over-period-reporting-in-motion
- AI tagging (Visual, Persona, Messaging, Hook) appears as chips in Card view, columns in Table view and Group-by options; Motion auto-creates "8 ready-to-use comparison reports in an AI Tag Comparisons folder." https://help.motionapp.com/en/articles/12461770-getting-started-with-ai-tagging-in-motion
- Snapshots for sharing: "up to 8 ads in bar chart or line chart view, but unlimited ads in card view." https://help.motionapp.com/en/articles/7843169-sharing-reports-snapshots
- "Images, videos, and data live in the same view and you can expand and watch any asset inside a report." https://motionapp.com/blog/motion-vs-ads-manager-creative-analysis
- AI layer: Runneth, "your team's always-on creative strategy teammate" with a trainable Brain and scheduled Slack updates. https://help.motionapp.com/en/collections/19683513-runneth
- Visual system: dark and light offered on the marketing site; in-app typography and chart colors: not found; semantic green/red deltas confirmed. https://motionapp.com/ and https://help.motionapp.com/en/articles/13454813-period-over-period-reporting-in-motion
- Criticism: tagging "limited to roughly eight fixed dimensions"; depends on "structured ad-naming conventions upfront"; "No proactive fatigue alerts"; "Meta gets the full feature set"; "Motion ends at analysis. You cannot brief creative from inside Motion." https://superscale.ai/alternatives/motion/review , https://rule1.ai/articles/motion-app-review , https://adlibrary.com/posts/motion-app-review-2026
- Borrow: thumbnail-first tile view with up to six metrics and inline playback; thumbnails as x-axis labels; group-by-tag bars over a table with click-through; unlimited cards vs capped series in shared snapshots; pre-built comparison folders from tags. https://help.motionapp.com/en/articles/7090459-how-to-build-a-report , https://motionapp.com/library/talk/how-reports-work-tips-tricks-in-motion/ , https://help.motionapp.com/en/articles/12461770-getting-started-with-ai-tagging-in-motion

### 2.15 Klaviyo

- Home dashboard: an alerts strip on top (failed payments, flow anomalies, delivery issues), then a conversion-metric dropdown and a time range up to 180 days, then three cards: Business performance summary (Total revenue vs Attributed revenue, split by channel and by flows vs campaigns, "View dashboard" top right), Top performing flows (up to six rows with name, trigger, status, message-type icons, deliveries, conversions, percent change) and Recent campaigns (name, sent time, open rate, click rate, conversions). https://help.klaviyo.com/hc/en-us/articles/9974064152347 and https://help.klaviyo.com/hc/en-us/articles/115005076387-The-Performance-Dashboard
- Overview dashboard: top controls for date range (up to 12 months), conversion metric and comparison period; four fixed cards (Growth overview, Campaign performance summary, Flows performance summary, Deliverability), each with tabs (Conversion summary, Message type breakdown, Channel breakdown); "It is not possible to remove or replace the cards." https://help.klaviyo.com/hc/en-us/articles/4708299478427-Understanding-the-overview-dashboard and https://help.klaviyo.com/hc/en-us/articles/16427152766619
- Attributed vs total revenue is a first-class distinction, shown as green vs blue bars; attributed follows send time, which can place conversions in the wrong month. https://help.klaviyo.com/hc/en-us/articles/16427152766619
- Comparison: previous period, previous year or custom; deltas are "percentage change versus the same, prior period," green positive, red negative. https://help.klaviyo.com/hc/en-us/articles/28474458127899
- Campaign card lines are "blue (open rate), teal (click rate), and yellow (conversion metric)" with peer benchmarks labelled "Excellent," "Fair," or "Poor." https://help.klaviyo.com/hc/en-us/articles/4708299478427-Understanding-the-overview-dashboard
- Custom reports (Single Metric Deep Dive, Multi-Metric, Campaign, Flow, Product Performance) output chart plus table and can be scheduled; the report builder adds grouping and up to 20 filters, CSV only. https://help.klaviyo.com/hc/en-us/articles/360047725651 and https://help.klaviyo.com/hc/en-us/articles/42789551068699
- Marketing Analytics add-on: CLV dashboard, audience performance table whose last columns switch between revenue and conversion counts with the chosen metric, funnel, RFM, cohort. https://help.klaviyo.com/hc/en-us/articles/17797865070235 and https://help.klaviyo.com/hc/en-us/articles/17798068936219
- Benchmarks: "Color-coded grades provide at-a-glance context for what's excelling and lagging"; peer groups of "100 companies that share your unique business dynamics"; monthly refresh. https://www.klaviyo.com/features/benchmarks
- Klaviyo AI: insights, flow anomaly detection, predicted CLV, churn risk, all marked with a "sparkle symbol for easy identification"; the Marketing Agent proposes changes for approval in a chat panel. https://www.klaviyo.com/solutions/ai and https://www.klaviyo.com/solutions/ai/marketing-agent
- Visual system: light UI, dark mode not found; a fixed three-color line palette (blue, teal, yellow) and two-color bars (green attributed, blue total), semantic green/red deltas. https://help.klaviyo.com/hc/en-us/articles/4708299478427-Understanding-the-overview-dashboard
- Borrow: total vs attributed revenue side by side on the first card; one global conversion-metric selector that recomputes every card; benchmark grade labels on the chart card; sparkle icon for AI-generated elements. https://help.klaviyo.com/hc/en-us/articles/9974064152347 , https://help.klaviyo.com/hc/en-us/articles/115005076707-About-The-Klaviyo-Dashboard , https://www.klaviyo.com/solutions/ai

### 2.16 Shopify admin analytics (2024 to 2026) and Polaris

Layout hierarchy
- The Analytics page shows "key sales, sessions, and fulfillment metrics for your store, updated within about 1 minute", for "any date range" with the ability "to compare data across time periods"; cards can be added, removed, rearranged, "organize[d] into labeled sections, and resize[d]"; the page also has "automatically generated insights that surface meaningful trends in your data" and "metric targets." https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/overview-dashboard
- Date control: defaults to "the last 90 days"; presets grouped into popular, period-to-date, quarters and BFCM; custom ranges are Fixed or Rolling ("Last 7 days", optionally including today). Comparison: "compare your metric data across 2 different time periods" with Previous period, Previous year or custom; "for all metrics, the percentage change from the previous date range can be displayed." Auto-refresh every 60 seconds when today is in range. https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/overview-dashboard/using-the-overview-dashboard
- Drill: "click the title of a card to go directly to the corresponding report." Insights sit at the top: "up to 5 insights per day" (for stores averaging 10+ orders a week), typed as Trending up/down or Top performers, each with a "See why" link to the report. https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/overview-dashboard/using-the-overview-dashboard
- Customisation: drag handle to move, X to remove; a metrics library sidebar grouped by Acquisition, Behavior, Customers; "each card can be included only one time"; resize from "the lower-right corner of the card"; full-size cards show all metrics of a multi-metric visualization while compact cards show only the primary metric; labelled sections can be collapsed; reset to default. https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/overview-dashboard/customizing-overview-dashboard
- Reports pair "a visualization that highlights your primary metrics or dimensions, alongside a detailed table providing additional insights", and the system lets you "monitor your business data at multiple levels of detail." https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/new-analytics
- Targets (April 2026 changelog): pick a metric, a filter, a period and an amount; "A visual gauge tracks your progress in real time, showing percentage complete, current vs target value, and days remaining"; add to the dashboard in one click; a Target index lists everything tracked. https://changelog.shopify.com/posts/set-and-track-targets-in-shopify-analytics
- Sidekick in analytics (October 2025): "The analytics query editor now integrates with Sidekick and understands natural language"; it "translates your questions into ShopifyQL with business friendly explanations of what each report measures"; follow-ups keep context; entry via "New Exploration" or any saved report. https://changelog.shopify.com/posts/turn-business-questions-into-analytics-reports-with-natural-language-queries
- Winter '25 Edition: "the new analytics, now rolling out to everyone"; "query your data directly from a report in real time using ShopifyQL"; customisable home-screen metrics in the mobile app. https://www.shopify.com/editions/winter2025
- Later changelog items: bubble and sunburst charts (June), heatmap visualization and a Weekly Sales Patterns report (October), minute-level granularity with "real-time visual indicators." https://changelog.shopify.com/posts/new-analytics-experience-now-available (the changelog index; individual posts linked from it)
- Sidekick generally: available "from any page in your Shopify admin", can keep working in the background and notify you when ready. https://help.shopify.com/en/manual/shopify-admin/productivity-tools/sidekick

- The dashboard is "a collection of data cards, known as metrics, each offering you a quick sum or value," such as "Net sales by channel or Sessions by device type"; "From each card, you can directly access a corresponding report"; custom explorations become new cards in the library. https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/new-analytics
- Launch copy: "drag & drop, resize, add, or remove any metric card," choose "which metrics you want to see appear there, in what order, and how visible you want them." https://www.shopify.com/blog/new-analytics
- ShopifyQL editor sits "at the top of the report" (June 11, 2025): FROM, SHOW, GROUP BY, SINCE/UNTIL or DURING, COMPARE TO ("put each month next to the one before it") and VISUALIZE; new analytics became the default for all stores the same day. https://changelog.shopify.com/posts/query-your-store-s-data-from-any-analytics-report , https://shopify.dev/docs/api/shopifyql , https://changelog.shopify.com/posts/new-analytics-is-now-the-default
- Live View: 2D map or 3D globe, "blue dots indicate recent visitor sessions, and purple dots indicate orders," cards for visitors right now, sales, sessions, orders, a full-screen mode for BFCM. https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/live-view
- Admin redesign (Sept 15, 2026): "new color, type, spacing, and icons, inside a new frame"; "Search, notifications, and the store picker now in the side navigation, which collapses"; "Sidekick moved from a side panel to a floating chat at the bottom of the page." https://changelog.shopify.com/posts/the-shopify-admin-has-a-new-look and https://shopify.dev/changelog/prepare-your-app-for-the-shopify-admins-new-look
- Reports cap at 1,000 rows on screen. https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/new-analytics/reports
- Criticism of the new analytics from merchants: "these new reports are not working, and the old ones are gone"; "On mobile it is completely impossible"; simple adjustments now "demand SQL query knowledge"; "Overcomplicated and unnecessary" with unwanted automatic charts. https://community.shopify.com/t/major-problem-with-new-reports-analytics/387818 and https://community.shopify.com/t/new-shopify-analytics-and-reports/400952
- A dashed or lighter comparison line on Shopify tiles is described by third parties ("sparkline trend lines and percentage-change indicators comparing your selected date range to a prior period") but not spelled out in official docs. https://ask-luca.com/blogs/shopify-analytics-guide

Visual system (Polaris)
- "The Shopify admin interface adopts a black and white color scheme, intentionally creating a neutral backdrop" so that "elements that incorporate color gain heightened visual impact and prominence." "Each usage of color within the Shopify admin is purposefully tied to a specific meaning" (red critical, green success, blue tips). "Using color as decoration is exclusive to illustration." "Use color in conjunction with other discernible elements to amplify the message." https://raw.githubusercontent.com/Shopify/polaris/main/polaris.shopify.com/content/design/colors/index.mdx
- Typography: "Variable weights convey different levels of importance, where bolder weights indicate greater significance"; monospace for code, "tabular number stylesets for numerical and currency values"; "Consistently style similar or repeating type in the UI." https://raw.githubusercontent.com/Shopify/polaris/main/polaris.shopify.com/content/design/typography/index.mdx
- Filters component: a query field plus filters and "promoted filters" for a list or table, with a loading state while results refresh. https://polaris.shopify.com/components/filters

- Polaris tokens: font stack "'Inter', -apple-system, BlinkMacSystemFont, 'San Francisco', 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"; weights regular 450, medium 550, semibold 650, bold 700; a 13-step size scale. https://raw.githubusercontent.com/Shopify/polaris/main/polaris-tokens/src/themes/base/font.ts
- Polaris color tokens: `color-bg` gray[6] (canvas), `color-bg-surface` gray[1] (cards), `color-text` gray[15], `color-text-secondary` gray[13], `color-border` gray[8], primary action fill `color-bg-fill-brand` gray[15] (a dark neutral, not a hue); semantic families critical (red), success (green), warning/caution (orange, yellow), info (azure). https://raw.githubusercontent.com/Shopify/polaris/main/polaris-tokens/src/themes/base/color.ts
- A dark theme exists in the tokens (`color-bg` gray[16], `color-bg-surface` gray[15], `color-text` gray[8]); whether merchants can switch to it: not found. https://raw.githubusercontent.com/Shopify/polaris/main/polaris-tokens/src/themes/dark.ts
- Spacing scale space-0 through space-3200 with semantic aliases card-gap, card-padding, table-cell-padding; Polaris web components use semantic "tone" (critical, success, info) and intensity (subdued, strong) props. https://raw.githubusercontent.com/Shopify/polaris/main/polaris-tokens/src/themes/base/space.ts and https://shopify.dev/docs/api/polaris/using-polaris-web-components
- Polaris 2.0 RC (Sept 24, 2026) carries the new admin's "new color, typography, spacing, and icons." https://shopify.dev/changelog/polaris-2-0-release-candidate

Borrow
- Insight cards at the top with "See why" links; card title as the drill link; compact vs full card sizes; labelled, collapsible sections; one-time-only cards; Fixed vs Rolling ranges. https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/overview-dashboard/using-the-overview-dashboard and https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/overview-dashboard/customizing-overview-dashboard
- Targets as a gauge of percent complete, current vs target and days remaining (render it as a bullet bar, not a dial). https://changelog.shopify.com/posts/set-and-track-targets-in-shopify-analytics
- Natural-language question that produces a visible, editable query. https://changelog.shopify.com/posts/turn-business-questions-into-analytics-reports-with-natural-language-queries
- COMPARE TO as a first-class query clause, so comparison is data, not decoration; a neutral grey canvas with one dark brand fill and strictly semantic color. https://shopify.dev/docs/api/shopifyql and https://raw.githubusercontent.com/Shopify/polaris/main/polaris-tokens/src/themes/base/color.ts

### 2.17 What the teardowns agree on

- Big number above a fixed-height chart with the comparison as a chip or second KPI: Stripe, Grafana Stat, PostHog Number, Mixpanel Metric. https://docs.stripe.com/stripe-apps/patterns/chart-layout , https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/stat/ , https://posthog.com/docs/product-analytics/trends/charts , https://docs.mixpanel.com/docs/reports/insights
- Comparison window equals the current window's length, chosen next to the date picker: Mixpanel, Amplitude, Shopify, Grafana, Northbeam. https://docs.mixpanel.com/docs/reports/insights , https://amplitude.com/docs/analytics/charts/event-segmentation/event-segmentation-interpret-2 , https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/overview-dashboard/using-the-overview-dashboard , https://docs.northbeam.io/docs/overview-page.md
- Overview tiles are entry points to a dedicated screen: Vercel, Shopify, Linear. https://vercel.com/changelog/overview-page-in-observability , https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/overview-dashboard/using-the-overview-dashboard , https://linear.app/docs/insights
- Chart on top, table underneath, every time: Shopify reports, Mercury transactions, Vercel observability, Motion comparative reports, Mixpanel retention. https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/new-analytics , https://mercury.com/blog/updated-transactions-page , https://vercel.com/docs/observability , https://help.motionapp.com/en/articles/8757626-identify-creative-trends-with-comparative-reports
- Neutral base, color only for status; chrome recedes: Shopify Polaris, Linear, Stripe. https://raw.githubusercontent.com/Shopify/polaris/main/polaris.shopify.com/content/design/colors/index.mdx , https://linear.app/blog/behind-the-latest-design-refresh , https://docs.stripe.com/stripe-apps/design
- Dark theme is table stakes in developer-grade tools (Grafana default, Linear, Vercel, PostHog, Mixpanel, Polar, Motion, Mercury) and absent in the finance-first ones (Stripe, Amplitude). https://grafana.com/docs/grafana/v13.1/administration/organization-preferences.md , https://linear.app/docs/account-preferences , https://posthog.com/blog/posthog-as-a-dev-tool , https://mixpanel.com/blog/dark-mode-in-mixpanel-is-here/ , https://insiders.stripe.dev/t/dashboard-dark-mode/2473
- The AI layer that works is docked beside the data and aware of the current view, and its output is rendered as ordinary cards or an editable query: Grafana Assistant, PostHog AI, Mixpanel RCA, Shopify Sidekick. https://grafana.com/blog/llm-grafana-assistant/ , https://posthog.com/docs/max-ai , https://docs.mixpanel.com/docs/root-cause-analysis , https://changelog.shopify.com/posts/turn-business-questions-into-analytics-reports-with-natural-language-queries
- Tabular numerals are stated explicitly only by Vercel and Polaris; everyone else leaves it implicit. https://vercel.com/geist/text , https://raw.githubusercontent.com/Shopify/polaris/main/polaris.shopify.com/content/design/typography/index.mdx

---

## 3. Patterns to borrow

### 3.1 KPI tile (stat card) anatomy
- Consistent module parts: title top left on every card, key value prominent, date context top right, every data element labelled; "Consistency is key." https://www.pencilandpaper.io/articles/ux-pattern-analysis-data-dashboards
- Delta rules: a delta needs a color status, a directional icon (up, flat, down), the percentage change, and the comparison context ("vs last week/month/year"); deltas should be "quick and easy to make sense of." https://www.pencilandpaper.io/articles/ux-pattern-analysis-data-dashboards
- "Make the most important the most noticeable and the least important, the least noticeable." https://www.pencilandpaper.io/articles/ux-pattern-analysis-data-dashboards
- Grafana Stat: value, optional name, sparkline drawn behind the value in Area mode, "automatically hidden if the panel becomes too small"; Percent Change with Standard, Inverted or Same-as-value coloring (Inverted is for low-is-good metrics like CPA); title, value and percent-change text sizes set independently. https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/stat/
- Grafana's rule for when to use which: Stat for one key metric with optional sparkline; Bar gauge for several values against thresholds; Gauge only for a value inside a known range. https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/stat/ and https://grafana.com/docs/grafana/next/panels-visualizations/visualizations/bar-gauge/
- Stripe's card: caption label, bold value, growth KPI, then a 180px chart; sparkline about 24 by 80px with no axes; never more than three charts in a row; same fixed height for loading, empty, error and populated states. https://docs.stripe.com/stripe-apps/patterns/chart-layout
- PostHog Number tile: "Enable Compare to previous period to show a percentage change pill." https://posthog.com/docs/product-analytics/trends/charts
- Big numbers (BANs) answer "where do we stand right now?" before any trend or filter; "just the number, a simple label, and maybe a small icon or color to show trends." https://vizmasters.substack.com/p/big-ass-numbers-bans-why-they-belong
- NN/g: "save strong signals like bold color for the single key number"; "if everything is emphasized, nothing is." https://www.nngroup.com/articles/dashboards-preattentive/
- Carbon: the most important data gets the highest contrast and the largest area; F-pattern with the most important item top left. https://v10.carbondesignsystem.com/data-visualization/dashboards
- Sparkline in the tile: Tufte's min and max dots, last-value dot tied to the printed number, a gray normal-range band, no frame. https://www.edwardtufte.com/notebook/sparkline-theory-and-practice-edward-tufte/
- Many entities: "sparklines in a searchable table" rather than many panels. https://www.datawrapper.de/blog/what-to-consider-when-creating-small-multiple-line-charts
- Target marker: a reference line or goal band on the chart (Datawrapper range highlights) or, better, a bullet bar (3.2). https://www.datawrapper.de/academy/range-highlights-and-lines

### 3.2 Bullet graph for target vs actual
- Few's spec: label, single linear scale, featured measure as a heavy black bar about one third the container height, one or two comparative markers as thin perpendicular lines, two to five (ideally three) qualitative ranges as intensities of one hue (40/25/10% black), darker for poor and lighter for good; reverse the fill order for low-is-good metrics; optional projection segment to show pace against a future target. http://www.perceptualedge.com/articles/misc/Bullet_Graph_Design_Spec.pdf
- "Developed to replace the meters and gauges that are often used on dashboards. Its linear and no-frills design provides a rich display of data in a small space." https://www.fusioncharts.com/resources/chart-primers/bullet-graph
- Ranges use "varying intensities of a single hue to make them discernible by those who are color blind and to restrict the use of colors on the dashboard to a minimum"; bullet graphs "may be stacked to allow comparisons of several measures at once." https://en.wikipedia.org/wiki/Bullet_graph
- Implementations: Power BI (bold performance bar, marker line, Poor/Average/Good background; targets can be budget, forecast, previous period or median) and Grafana Bar gauge (bars with thresholds, horizontal or vertical). https://www.sqlbi.com/articles/building-bullet-charts-in-power-bi-reports/ and https://grafana.com/docs/grafana/next/panels-visualizations/visualizations/bar-gauge/
- Shopify's new targets show "percentage complete, current vs target value, and days remaining"; that is exactly the bullet graph's data, so render it linearly. https://changelog.shopify.com/posts/set-and-track-targets-in-shopify-analytics

### 3.3 Small multiples rows (one tiny chart per brand)
- Tufte: "For a wide range of problems in data presentation, small multiples are the best design solution"; "postage-stamp size, indexed by category or a label." https://en.wikipedia.org/wiki/Small_multiple and https://www.antoinebuteau.com/lessons-from-edward-tufte/
- Datawrapper rules: same y-axis across panels whenever possible, and if not, say so and signal it with unusual gridlines; sort panels meaningfully (start value, end value, range, percent change) and state the sort; "Fewer data points allow smaller panels"; repeat all lines faintly in each panel's background so readers can rank at a glance; terse annotations. https://www.datawrapper.de/blog/what-to-consider-when-creating-small-multiple-line-charts
- When to choose them: untangling overlapping lines, showing trend shapes, comparing very different magnitudes; use one multi-line chart when readers must compare exact values at one point in time. https://www.datawrapper.de/blog/what-to-consider-when-creating-small-multiple-line-charts
- Small multiple columns for "many categories of values"; independent scales only with grid labels always shown; overlay markers for the overall average. https://www.datawrapper.de/blog/small-multiple-column-charts
- Observable Plot faceting: partition by a categorical value, repeat the plot per facet; "when there are many facets, facets may be small and hard to read," so increase size or wrap into rows. https://observablehq.com/plot/features/facets

### 3.4 Stacked channel bars with a table underneath
- Shopify reports pair "a visualization that highlights your primary metrics or dimensions, alongside a detailed table providing additional insights." https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/new-analytics
- Metabase: every question toggles between the visualization and the table of results; bar and area charts offer Don't stack, Stack, Stack 100%. https://www.metabase.com/docs/master/questions/visualizations/visualizing-results
- Power BI "Show as a table": "by default, the data displays below the visual," switchable to side by side, with export. https://learn.microsoft.com/en-us/power-bi/visuals/service-reports-show-data
- Mixpanel's retention curve "always includes both a line chart and a table; the data is identical between the two." https://docs.mixpanel.com/docs/reports/retention
- Motion comparative reports: a bar per group on top, the table of individual ads below, click a bar to open the group. https://help.motionapp.com/en/articles/8757626-identify-creative-trends-with-comparative-reports
- Looker tables take dimensions, measures, pivots and totals; the totals row is where the "all channels" line belongs. https://docs.cloud.google.com/looker/docs/table-options?hl=en

### 3.5 Cohort triangle (retention / LTV) tables
- Shopify cohort analysis: rows are cohorts by first-order week, month or quarter; column one is the cohort, two the metric total, three the first-order value, then the metric per period since first order; default view is the heatmap grid with a retention-curve alternative; metrics include customers, retention rate, gross and net sales, AOV, amount spent per customer. https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/report-types/customers-reports
- Mixpanel retention table: "each box within a row is assigned a shade of purple. The shading gets darker the higher the retention percentage"; shade is relative to each row; in-progress cells carry an asterisk; a Size column holds cohort count. https://docs.mixpanel.com/docs/reports/retention
- Amplitude: chart plus table; first row overall, then per cohort per bucket; "Return On" vs "Return On or After." https://amplitude.com/docs/analytics/charts/retention-analysis/retention-analysis-interpret
- Reading rules: "the darker the colour, the higher the lifetime value"; a dark row is a better cohort, a dark column is a lifecycle milestone, a diagonal is a calendar event hitting every cohort at once. https://help.conjura.com/en/articles/9965367-tips-how-to-read-and-interpret-the-ltv-heatmap
- Read down a column to compare cohorts at the same age (did a change work), across a row to see decay and whether it flattens. https://documentation.onesignal.com/docs/en/interpreting-retention-curves
- Lifetimely's layout: row per cohort, column per month since first purchase, cell is cumulative LTV, shaded; shows CAC break-even. https://lifetimely.helpscoutdocs.com/article/61-lifetime-value-report-walkthrough (help centre returns 404 to fetches; description from search results)
- Few's color rule for the heatmap: one hue, pale to dark; turn the numbers off while scanning for pattern and show them on hover or in a twin table. https://www.perceptualedge.com/articles/visual_business_intelligence/rules_for_using_color.pdf

### 3.6 Anomaly / insight strip at the top
- Shopify: insights sit at the top of the dashboard, "up to 5 insights per day", typed Trending up/down or Top performers, each with "See why" to the report. https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/overview-dashboard/using-the-overview-dashboard
- Datadog: an "Investigate" button at the top of the dashboard; anomalies "highlighted in pink on the graph"; co-occurring anomalies grouped into one issue ("Anomalies co-occur on 18 widgets"); each issue names metric, time, influential tags and the widget, and clicking scrolls to it. https://docs.datadoghq.com/dashboards/graph_insights/investigate_anomalies/
- GA4 Insights cards on the home page with "View all insights"; automated detection of "unusual changes or emerging trends"; ranked by what you interact with. https://support.google.com/analytics/answer/9443595
- Amplitude Anomaly + Forecast: a confidence band on the chart, agile vs robust training windows. https://www.amplitude.com/docs/analytics/anomaly-forecast
- Mixpanel RCA: an Interpretation card first (explanation, confidence, next steps), then ranked dimension cards, with a live progress banner. https://docs.mixpanel.com/docs/root-cause-analysis
- Triple Whale Moby Observability: anomaly runs three times a day, thresholds for known ranges, AI root cause on a flag (search summary). https://kb.triplewhale.com/en/articles/12986027-moby-observability
- NN/g: guide attention to critical values "but not by flashing endless alerts without prioritization." An indicator makes an element "stand out to inform the user that there is something special about it," which is the right frame for a strip (indicator), not a toast (notification). https://www.nngroup.com/videos/alert-fatigue-user-interfaces/ and https://nngroup.com/articles/indicators-validations-notifications

### 3.7 Compare-period ghost line
- Shopify: Previous period or Previous year, percent change on every metric. https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/overview-dashboard/using-the-overview-dashboard
- ShopifyQL: `COMPARE TO previous_period` with `TIMESERIES` so points line up. https://shopify.dev/docs/api/shopifyql/latest.md
- Mixpanel: comparison window always matches the current window; previous-year weekend points shifted to Monday; hover shows which past period a point is compared to. https://docs.mixpanel.com/docs/reports/insights
- Amplitude: compare up to two past periods, percent difference, same hour of day for intraday. https://amplitude.com/docs/analytics/charts/event-segmentation/event-segmentation-interpret-2
- Grafana: comparison offset in the panel header; tooltip delta color Standard, Inverted or Same as value. https://grafana.com/whats-new/2026-09-24-panel-time-settings-and-time-comparison-are-now-generally-available/
- Styling: give the comparison its own lighter or dashed line (Datawrapper per-line color, width and dash); "consider the grey as the most important color in Data Vis" so the current series pops. https://blog.datawrapper.de/improved-line-chart-editing and https://www.datawrapper.de/blog/colors
- Visa's design system draws current year in the highlight color and prior year in grey. https://design.visa.com/data-visualization/charts/line-chart/examples/
- A legend swatch for the comparison "so you can tell the current period apart from the baseline at a glance." https://docs.uselayers.com/help/analytics/dashboards

### 3.8 Breakdown table with inline bars
- Metabase "mini bar charts": a small horizontal bar next to each number sized relative to the column; color range is "a subtler version of the mini bar chart." https://metabase.com/learn/metabase-basics/querying-and-dashboards/visualization/table
- Power BI data bars via conditional formatting; Excel: "a longer bar represents a larger value"; widening the column makes differences easier to see; fix min and max so bars are comparable. https://learn.microsoft.com/en-gb/power-BI/visuals/power-bi-visualization-conditional-formatting and https://support.microsoft.com/en-us/excel/use-data-bars-color-scales-and-icon-sets-to-highlight-data
- Table rules that make bars work: right-align numbers on the decimal; tabular figures so $1,111.11 does not look smaller than $999.99; left-align qualitative numbers (dates, codes); row heights condensed 40px, regular 48px, relaxed 56px, user-selectable; sort chevrons must not shift heading alignment. https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables
- Bars share one scale and a zero baseline; truncated bars exaggerate differences (Pandey et al. 2015). https://www.datawrapper.de/academy/why-our-column-and-bar-charts-start-at-zero
- Length beats color for comparing magnitudes. https://www.nngroup.com/articles/dashboards-preattentive/
- Northbeam's red-to-green sliding-scale metric coloring is the opposite approach; see 4.9 for why a bar is the better cell. https://docs.northbeam.io/docs/creative-analytics.md

### 3.9 Sticky period / scope control
- Grafana's time picker governs the whole dashboard, relative syntax, zoom out, time zone in the same control. https://grafana.com/docs/grafana/v8.3/dashboards/time-range-controls
- Datadog's global time selector "sets the time standard for displaying data in widgets within the dashboard." https://docs.datadoghq.com/dashboards/guide/custom_time_frames
- Looker: filters apply to all tiles or one; filter bar at the top, collapsible; viewers can change values temporarily. https://docs.cloud.google.com/looker/docs/filters-user-defined-dashboards
- Amplitude: dashboard-level date, interval and property filters with a shareable URL. https://amplitude.com/docs/analytics/dashboard-filter
- Mixpanel: temporary filters vs pinned filters. https://docs.mixpanel.com/docs/boards
- Northbeam: attribution model, window, accounting mode, granularity and comparison all live together on the page, and the advice is to "keep them stable." https://docs.northbeam.io/docs/overview-page.md and https://docs.northbeam.io/docs/journey/design-your-dashboard.md
- Polaris Filters: query field plus promoted filters, loading state while results refresh. https://polaris.shopify.com/components/filters
- NN/g on sticky headers: quick access "without scrolling", but keep the bar short (13:1 content-to-chrome is good, 2:1 is bad), opaque, high contrast. https://www.nngroup.com/articles/sticky-headers/
- Material 3 top app bar "pinned" is the default scroll behaviour: fixed, gains elevation on scroll. https://www.sap.com/design-system/fiori-design-android/v25-8/components/m3-standard-components/top-app-bar/usage

### 3.10 Drill from tile to table
- Shopify: "click the title of a card to go directly to the corresponding report"; every report is chart plus table. https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/overview-dashboard/using-the-overview-dashboard
- Vercel: each overview metric has "one-click access to their dedicated dashboards." https://vercel.com/changelog/overview-page-in-observability
- Power BI drillthrough lands on a page filtered to the clicked entity with "Keep all filters." https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-drillthrough
- Looker drill menu opens a dashboard pre-filtered to the clicked value. https://docs.cloud.google.com/looker/docs/viewing-and-interacting-with-explores
- Apple: moving from preview to detail "should maintain continuity by preserving values, context and state." https://nonstrict.eu/wwdcindex/wwdc2022/110342/
- NN/g progressive disclosure: show "only a few" options first, more "upon request"; more than two levels causes trouble; the link to the next level must have clear information scent. https://www.nngroup.com/articles/progressive-disclosure/
- Carbon exploration dashboards: linked charts mirror filters and zoom across related charts. https://v10.carbondesignsystem.com/data-visualization/dashboards

### 3.11 Command palette / ask box
- Command K bars "pop up in the middle of the screen when you hit a certain keyboard shortcut"; they double as universal search for actions and content; fuzzy matching finds functions "without needing the exact name"; libraries cmdk, kbar. https://maggieappleton.com/command-bar
- GitHub: Cmd/Ctrl K; Cmd/Ctrl Shift K opens in command mode. https://docs.github.com/en/get-started/accessibility/github-command-palette
- Vercel: Cmd/Ctrl K lists shortcuts, arrows and Enter to jump. https://vercel.com/docs/personal-accounts/command-menu
- Linear: Cmd/Ctrl K "runs any action or jumps to any page when you type its name"; "if you forget any other shortcut, open the command menu and type what you want to do." https://linear.app/enablement/guides/navigating-linear
- cmdk: "a command menu React component that can also be used as an accessible combobox. You render items, it filters and sorts them automatically." https://awesome.ecosyste.ms/projects/github.com%2Fpacocoursey%2Fcmdk
- Natural-language ask: Shopify Sidekick shows the ShopifyQL it wrote with a plain-English explanation; Ask Amplitude sends only the conversation to the model; PostHog AI edits filters next to you; ThoughtSpot Spotter answers "Why did my sales drop last month?" with key drivers and lets admins add natural-language instructions (default date filters). https://changelog.shopify.com/posts/turn-business-questions-into-analytics-reports-with-natural-language-queries , https://amplitude.com/docs/analytics/ask-amplitude , https://posthog.com/docs/max-ai , https://docs.thoughtspot.com/cloud/10.15.0.cl/spotter-getting-started
- Grafana Assistant stays docked and knows the current view. https://grafana.com/blog/llm-grafana-assistant/

---

## 4. Anti-patterns to avoid

### 4.1 Card walls with no hierarchy
- Few's mistakes 9 and 10: arranging information poorly and failing to highlight what matters; critical data must be visually distinct so viewers do not search. https://www.thedataschool.co.uk/anh-vu/are-you-making-these-13-dashboard-design-mistakes-part-2
- Carbon: "prioritize data by importance, then create a clear visual hierarchy"; white space separates and groups. https://v10.carbondesignsystem.com/data-visualization/dashboards
- Pencil and Paper names it: "wall of text, but make it data," showing everything because it exists. https://www.pencilandpaper.io/articles/ux-pattern-analysis-data-dashboards
- NN/g: "if everything is emphasized, nothing is." https://www.nngroup.com/articles/dashboards-preattentive/
- Bach et al. distinguish "open" layouts (widgets of different sizes, no grouping rule) from "stratified" (top-down by importance) and "grouped" layouts; the wall is the open layout without the ordering. https://dashboarddesignpatterns.github.io/patterns.html

### 4.2 Every number the same size
- Show the KPI as a big number, not buried in a chart; eyes go to bigger numbers. https://www.tableau.com/blog/7-tips-and-tricks-dashboard-experts (403 to fetch; content from search results)
- BANs exist so the reader gets "where do we stand right now?" first. https://vizmasters.substack.com/p/big-ass-numbers-bans-why-they-belong
- Reserve bold color for "the single key number." https://www.nngroup.com/articles/dashboards-preattentive/
- Material: a clear primary, secondary and tertiary hierarchy. https://echai.ventures/startingup/from/google-material-design

### 4.3 Rainbow categorical colors / too many hues
- "If you need more than seven colors in a chart, consider using another chart type or to group categories together"; never a gradient for categories; vary lightness as well as hue. https://www.datawrapper.de/blog/colors
- Few rule 4: "Use different colors only when they correspond to differences of meaning in the data." https://www.perceptualedge.com/articles/visual_business_intelligence/rules_for_using_color.pdf
- Few mistakes 6 and 12: meaningless variety, misused color. https://www.thedataschool.co.uk/anh-vu/are-you-making-these-13-dashboard-design-mistakes/
- "You should be able to justify every single color on your dashboard... if you can't answer that question, remove the color." https://www.tableau.com/blog/7-tips-and-tricks-dashboard-experts
- Carbon: "always use consistent colors for each data set within a dashboard"; use the curated categorical sequence in order. https://v10.carbondesignsystem.com/data-visualization/dashboards and https://carbondesignsystem.com/data-visualization/color-palettes/
- Imhof via Tufte: strong colors "have loud, unbearable effects when they stand unrelieved over large areas adjacent to each other." https://www.justinobeirne.com/cartography-reading-list

### 4.4 3D charts
- NN/g: 3D "distort[s] and skew[s] the shapes that represent the data"; "nobody should ever use 3D designs in their data visualizations." https://www.nngroup.com/articles/dashboards-preattentive/ and https://www.nngroup.com/articles/clutter-charts/
- Few rule 9: "Avoid using visual effects in graphs." https://www.perceptualedge.com/articles/visual_business_intelligence/rules_for_using_color.pdf
- Wilke, "Don't Go 3D": the third dimension is "gratuitous." https://www.safaribooksonline.com/library/view/fundamentals-of-data/9781492031079/ch26.html
- Tufte's chartjunk list includes "unnecessary dimensions." https://en.wikipedia.org/wiki/Chartjunk

### 4.5 Donut and pie charts for comparison
- Few, "Save the Pies for Dessert": pies are only readable near 0, 25, 50, 75 and 100 percent; a labelled pie is "an awkwardly arranged equivalent of a table." https://www.betterevaluation.org/sites/default/files/08-21-07.pdf
- NN/g: "notoriously poor at most information-communication tasks." https://www.nngroup.com/articles/dashboards-preattentive/
- Few: pie slices encode value three ways (area, angle, arc) and "we cannot perceive any one of these attributes accurately." https://ixdf.org/literature/book/the-encyclopedia-of-human-computer-interaction-2nd-ed/data-visualization-for-human-perception
- Knaflic: replace with a horizontal bar chart sorted largest to smallest. https://edgeforscholars.vumc.org/storytelling-with-data-a-data-visualization-guide/
- If you must: few slices, labelled directly. https://www.datawrapper.de/blog/better-piecharts/

### 4.6 Gauges and speedometers
- Few: the research behind car-style gauges on business dashboards is "zilch"; most "should be banished because they display data poorly"; "Let paper work like paper and screens like screens." https://www.perceptualedge.com/blog/?p=1423 and https://www.tib.eu/en/search/id/BLSE%3ARN164860927/Dashboard-Design-Taking-a-Metaphor-Too-Far/
- A dashboard "filled with cute gauges, meters, and traffic lights" that does not tell you what you need in an instant will never be used; three gauges took the space of seven bullet-graph rows. https://blogs.ischool.berkeley.edu/i247s13/files/2013/02/WhyMostDashboardsFail.pdf
- NN/g: gauges "consume a lot of precious space" and are "harder to interpret than linear graphs." https://www.nngroup.com/articles/dashboards-preattentive/
- Replacement: the bullet graph (3.2). https://en.wikipedia.org/wiki/Bullet_graph

### 4.7 Dashboards that scroll to answer the first question
- Few mistake 1: "viewers should not have to scroll or switch between multiple screens." https://www.thedataschool.co.uk/anh-vu/are-you-making-these-13-dashboard-design-mistakes/
- NN/g eyetracking (2018, 120 people): 57% of viewing time is above the fold, 74% in the first two screenfuls; attention drops sharply at the fold regardless of page length. https://www.nngroup.com/articles/scrolling-and-attention/
- Bach et al.: "screenfit" vs "overflow" is a named design choice; pick screenfit for the top layer and detail-on-demand below. https://dashboarddesignpatterns.github.io/patterns.html
- Amplitude's own motivation for its chart redesign: controls that "bump the chart off the bottom of the page." https://www.amplitude.com/blog/evolution-of-amplitude-charts

### 4.8 Tables that scroll sideways
- Oracle: "horizontal scrolling should usually be avoided, because users may not realize that additional columns are hidden from view"; cap at six to eight columns; if unavoidable, lock the first column and add a 2 to 4px shadow. https://www.oracle.com/webfolder/ux/middleware/richclient/guidelines5/tblInformation.html
- Pencil and Paper: freeze the leftmost column ("just as important as the fixed header"), optionally the rightmost totals column, sticky header, hide/show and resize columns; the team should "prioritize which columns are the most important for the user to see upon page load." https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables
- NN/g data tables: the four tasks are find, compare, view or edit a row, act on rows; comparison only works when the compared columns are visible together. https://nngroup.com/articles/data-tables
- Baymard: horizontal panning forces users to rely on memory; remove identical attributes, group attributes, persist headings. https://baymard.com/research-articles/user-friendly-comparison-tools
- NN/g video on big tables for desktop apps. https://www.nngroup.com/videos/designing-tables-desktop-apps/

### 4.9 Other well-sourced anti-patterns
- Dual y-axes: Datawrapper refuses to build them; where lines cross depends on the axis ranges; use two charts or an indexed chart. https://www.datawrapper.de/blog/dualaxis and https://digitalblog.ons.gov.uk/2019/07/03/dueling-with-axis-the-problems-with-dual-axis-charts
- Truncated bar axes: readers "perceived the underlying message in its exaggerated form"; bars start at zero, lines need not. https://www.datawrapper.de/academy/why-our-column-and-bar-charts-start-at-zero and https://www.tableau.com/blog/truncating-y-axis-threat-or-menace
- Heavy gridlines, borders, backgrounds, gradients, decorative icons: chartjunk is "ink that does not tell the viewer anything new"; gridlines are junk when data labels give exact values; drop legends for direct labels. https://en.wikipedia.org/wiki/Chartjunk and https://www.nngroup.com/articles/clutter-charts/ and https://kmim.wm.pwr.edu.pl/?p=406
- Red/green only, no second cue: "color-only coding" is an accessibility failure; add an icon, sign, or text; "get it right in black and white." https://www.pencilandpaper.io/articles/ux-pattern-analysis-data-dashboards and https://www.datawrapper.de/blog/colorblindness-part2
- Red-to-green sliding scales on every metric cell (Northbeam creative analytics): this encodes quantity with hue, which NN/g says "should not be used to communicate information about quantitative values," and it floods the table with the two colors Few says never to pair. https://docs.northbeam.io/docs/creative-analytics.md , https://www.nngroup.com/articles/dashboards-preattentive/ , https://www.perceptualedge.com/articles/visual_business_intelligence/rules_for_using_color.pdf
- Excess decimal precision: Few mistake 3. https://www.thedataschool.co.uk/anh-vu/are-you-making-these-13-dashboard-design-mistakes/
- Metrics without comparison: Few mistake 2; "missing comparisons," no baselines, unexplained acronyms without tooltips. https://www.pencilandpaper.io/articles/ux-pattern-analysis-data-dashboards
- Legends instead of direct labels: Few mistake 7; NN/g. https://www.thedataschool.co.uk/anh-vu/are-you-making-these-13-dashboard-design-mistakes-part-2 and https://www.nngroup.com/articles/clutter-charts/
- Charts that only work because of their labels (Kaiser Fung's self-sufficiency test: cover the labels, see what is left). https://blogs.ams.org/blogonmathblogs/2020/04/24/junk-charts-a-tour/
- Dropdowns and tabs that hide the comparison: readers cannot compare what they cannot see at once; use small multiples instead. https://academy.datawrapper.de/article/162-alternatives-for-drop-down-menus-and-tabs
- Thin font weights and text under 12px in data displays. https://www.datawrapper.de/blog/fonts-for-data-visualization
- Variable-width digits in columns ("digit drift"): use tabular figures. https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables and https://www.datawrapper.de/blog/fonts-for-data-visualization

---

## 5. A visual system for Locus

Everything below is a proposal, with the reason and the source beside each choice. It is written so a designer or the Strategist can turn it straight into tokens in mobius.css (the per-app accent tokens already exist via `<html data-app>`).

### 5.1 Base palette: graphite dark, with a true light theme

- Two full themes, not an inversion. Datawrapper's dark mode is an algorithm that keeps the same contrast ratios on the dark background and re-derives gridlines, keys, highlight ranges and heatmaps; Carbon publishes separate light and dark hex values for every swatch and flips its sequential palettes (darker = larger in light, lighter = larger in dark). Locus should do the same: every token has a light value and a dark value, including chart tokens. https://www.datawrapper.de/blog/dark-mode-for-embedded-visualizations and https://carbondesignsystem.com/data-visualization/color-palettes/
- Dark theme is dark grey, never black: Material's baseline is #121212 because dark grey "increases visibility for shadows and also reduces eye strain for light text"; surfaces step lighter as they rise. https://material.io/develop/android/theming/dark and https://m2.material.io/design/color/dark-theme
- Warm the grey a touch: "Since grey can seem a bit cold, consider using it with a hint of color: Try a warm grey." Linear moved its grays from "cool, blue-ish" to "warmer gray that still feels crisp, but less saturated" for the same reason. https://www.datawrapper.de/blog/colors and https://linear.app/blog/behind-the-latest-design-refresh
- Use a 12-step neutral scale with fixed jobs, Radix style: steps 1 and 2 app and subtle backgrounds, 3 to 5 component backgrounds (normal, hover, pressed), 6 to 8 borders (subtle, interactive, strong/focus), 9 and 10 solid fills, 11 low-contrast text, 12 high-contrast text; in dark mode the app background is step 1 of the grey scale. Vercel's Geist does the same with 10 steps. https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale and https://vercel.com/geist/colors
- Suggested graphite scale for dark (to be tuned in LCH, as Linear does, so steps are perceptually even): app background about L 8 to 10 (near #121212 to #141416), card surface one step up, sidebar one step dimmer than content because "components supporting orientation and navigation should recede." https://linear.app/blog/how-we-redesigned-the-linear-ui and https://linear.app/blog/behind-the-latest-design-refresh
- Light theme: white or near-white canvas, white cards on a very light grey canvas (Michelin's "unified grey background" with "white cards"), text near-black not pure black, same 12 jobs. https://designsystem.michelin.com/data-visualization/design-guidelines/principles-of-a-dashboard
- Shopify's own tokens are the proof that a neutral works at scale: canvas gray[6], cards gray[1], text gray[15], borders gray[8], and even the primary button is a dark neutral (`color-bg-fill-brand` gray[15]) rather than a hue, with the dark theme swapping to a gray[16] canvas and gray[15] cards. https://raw.githubusercontent.com/Shopify/polaris/main/polaris-tokens/src/themes/base/color.ts and https://raw.githubusercontent.com/Shopify/polaris/main/polaris-tokens/src/themes/dark.ts
- Borders are barely there: Few's rule 7 (non-data components "just visibly enough to perform their role"), Linear's "fewer separators" so structure is "felt not seen", Geist's depth by radius and shadow more than borders. Default card border is step 6; separators inside cards are white space, not lines. https://www.perceptualedge.com/articles/visual_business_intelligence/rules_for_using_color.pdf , https://linear.app/blog/behind-the-latest-design-refresh , https://vercel.com/geist/materials

### 5.2 One accent

- One chromatic accent for the whole app's chrome: focus rings, the current series on a chart, the selected tab, primary buttons, links. Linear reduced an entire theme to "base color, accent color, and contrast"; Few's rule 5 uses bright color only "to highlight information that requires greater attention"; Imhof: strong colors work "when they are used sparingly on or between dull background tones." https://linear.app/blog/how-we-redesigned-the-linear-ui , https://www.perceptualedge.com/articles/visual_business_intelligence/rules_for_using_color.pdf , https://www.justinobeirne.com/cartography-reading-list
- Locus already has a per-app accent token; keep it, and keep the standing rule that the accent is chrome only and never carries good, warn or bad meaning (team memory "App accents + rounded favicons"). Polaris says the same in its own words: "Each usage of color within the Shopify admin is purposefully tied to a specific meaning." https://raw.githubusercontent.com/Shopify/polaris/main/polaris.shopify.com/content/design/colors/index.mdx
- Desaturate the accent in dark mode so it passes 4.5:1 on every surface, as Material prescribes. https://material.io/develop/android/theming/dark
- On charts, the accent is the current period or the selected brand; everything else is grey. "Make everything else gray"; "Don't use a separate hue for de-emphasized data," use a desaturated or transparent version. https://www.datawrapper.de/blog/emphasize-with-color-in-data-visualizations

### 5.3 Semantic colors, for state only

- Three semantic tokens, good / warn / bad, plus info. Carbon's status palette is red (danger), orange (serious warning), yellow (warning), green (success); Radix's recommended families are red for error, amber for warning, green for success, blue for info. https://carbondesignsystem.com/data-visualization/color-palettes/ and https://www.radix-ui.com/colors/docs/palette-composition/composing-a-palette
- They appear on deltas, status dots, the anomaly strip and bullet-graph markers, never as chart series colors and never as cell backgrounds across a whole table. Northbeam's red-to-green cell scale is the cautionary example (4.9). https://docs.northbeam.io/docs/creative-analytics.md
- Never red beside green without a second cue: Few rule 8; Polaris "Use color in conjunction with other discernible elements"; Datawrapper "get it right in black and white." Every delta carries an arrow and a signed number, every status dot has a label or tooltip. https://www.perceptualedge.com/articles/visual_business_intelligence/rules_for_using_color.pdf , https://raw.githubusercontent.com/Shopify/polaris/main/polaris.shopify.com/content/design/colors/index.mdx , https://www.datawrapper.de/blog/colorblindness-part2
- Polarity is a metric property stored on the metric definition (Lifetimely's "trend direction"): CPA and CAC down is good. Grafana's Inverted percent-change mode is the model; Few reverses the bullet-graph fill for expenses. https://help.useamp.com/article/1090-custom-metrics-walkthrough https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/stat/ and http://www.perceptualedge.com/articles/misc/Bullet_Graph_Design_Spec.pdf
- Sequential encodings (heatmaps, cohort tables) use one hue from pale to dark, never a hue ramp; diverging (profit vs loss) uses blue and red around a neutral midpoint, not green and red. https://www.perceptualedge.com/articles/visual_business_intelligence/rules_for_using_color.pdf
- Categorical colors for channels (Meta, Google, TikTok, Email, Store): one curated sequence of at most six to seven medium-intensity hues, applied in the same order everywhere so Meta is always the same color on every screen; muted enough that no one hue pops. https://www.datawrapper.de/blog/colors , https://carbondesignsystem.com/data-visualization/color-palettes/ , https://v10.carbondesignsystem.com/data-visualization/dashboards

### 5.4 Type pair

- UI face: Inter, with Inter Display (or Inter at display sizes with tighter tracking) for the hero numbers and page titles. Linear's pairing is exactly this ("Inter Display... for headings", "regular Inter for the rest"); Inter is "clear at 11px" with a tall x-height for dense layouts; Polaris and Vercel both call for tabular numerals on data. https://linear.app/blog/how-we-redesigned-the-linear-ui , https://fontalternatives.com/blog/best-fonts-dense-dashboards/ , https://vercel.com/geist/text , https://raw.githubusercontent.com/Shopify/polaris/main/polaris.shopify.com/content/design/typography/index.mdx
- Shopify ships the same face in its admin: Inter first in the stack, with weights 450 regular, 550 medium, 650 semibold; use those three weights plus 700 for the hero number and nothing lighter. https://raw.githubusercontent.com/Shopify/polaris/main/polaris-tokens/src/themes/base/font.ts
- Numbers: `font-variant-numeric: tabular-nums lining-nums` on every tile value, table cell, axis tick and delta. "Tabular numerals in a proportional font give aligned columns with better readability than monospace," so no monospace for money. https://fontalternatives.com/blog/best-fonts-dense-dashboards/ and https://www.datawrapper.de/blog/fonts-for-data-visualization
- Second face: a mono (Geist Mono or JetBrains Mono) only for IDs, campaign names in code style, timestamps and query text (the Strategist's SQL or the "what we asked" line), the way Geist reserves Mono for "code references and tabular data display." https://vercel.com/geist/typography
- Scale: body and table text 13px at line-height 1.4 ("the best density-to-readability ratio"); labels and captions 12px, never below ("below 12px will likely be too small"); tile values 28 to 32px at weight 500 to 600 (Mercury's financial figures sit at "28px size, 500 weight, -0.5px tracking"); page title 20px; the Home hero number may go to 40px. No thin weights anywhere (they read as a lighter color). https://fontalternatives.com/blog/best-fonts-dense-dashboards/ , https://www.datawrapper.de/blog/fonts-for-data-visualization , https://blakecrosley.com/guides/design/mercury
- Three type roles, as in Geist: Heading, Label (single line, generous line height to sit beside icons), Copy (multi-line). "text-label-14 (Strong)" is the workhorse. https://vercel.com/geist/text

### 5.5 Tile anatomy

Every KPI tile in Locus is the same component, top to bottom, left to right:
1. Label, top left, 12px, step-11 grey, with the unit or definition on hover (Pencil and Paper: title top left on every card; Few mistake 4 on unclear measures). https://www.pencilandpaper.io/articles/ux-pattern-analysis-data-dashboards
2. Value, 28 to 32px, tabular, step-12 text, rounded to what the decision needs (Few mistake 3). https://www.thedataschool.co.uk/anh-vu/are-you-making-these-13-dashboard-design-mistakes/
3. Delta chip beside or under the value: arrow, signed percent, "vs prev 30d" context in grey; colored good/bad by metric polarity (Grafana Inverted; PostHog's "percentage change pill"). https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/stat/ and https://posthog.com/docs/product-analytics/trends/charts
4. Sparkline, right or below, about 24 by 80px to 32 by 120px, no axes, "lumpy" aspect, light grey band for the normal range, end dot at the current value, the compare period as a faint grey ghost line; auto-hidden when the tile is compact (Stripe sizes, Tufte rules, Grafana auto-hide). https://docs.stripe.com/stripe-apps/patterns/chart-layout , https://www.edwardtufte.com/notebook/sparkline-theory-and-practice-edward-tufte/ , https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/stat/
5. Target, when one exists: a thin bullet bar under the value (heavy bar = actual, thin tick = target, three grey bands, projected-pace segment hatched), never a dial. Shopify's target data (percent complete, current vs target, days remaining) maps onto it directly. http://www.perceptualedge.com/articles/misc/Bullet_Graph_Design_Spec.pdf and https://changelog.shopify.com/posts/set-and-track-targets-in-shopify-analytics
6. The whole tile is the drill link (Shopify: click the title; Vercel: one click to the dedicated dashboard), with a hover affordance and the same period carried into the detail screen (Apple: preserve values, context and state). https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/overview-dashboard/using-the-overview-dashboard , https://vercel.com/changelog/overview-page-in-observability , https://nonstrict.eu/wwdcindex/wwdc2022/110342/
7. Fixed height across loading, empty, error and populated states so the grid never jumps. https://docs.stripe.com/stripe-apps/patterns/chart-layout
8. Optional first hop before the full drill: clicking a tile can open an in-place bar view of this period vs the compare period (Triple Whale's Summary behaviour), with the title taking you on to the full screen. https://kb.triplewhale.com/en/articles/5725275-track-kpis-with-the-summary-dashboard
Two sizes only: compact (label, value, delta) and full (adds sparkline and bullet), the way Shopify's compact cards show only the primary metric. https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/overview-dashboard/customizing-overview-dashboard

### 5.6 Grid

- 12 columns, 24px gutter, 24px page margin; tiles snap to 3, 4 or 6 columns (four, three or two per row). Mixpanel's twelfths with a quarter-width minimum and Amplitude's "max of 4 items per row" set the ceiling; Stripe's "Don't place more than three charts in a single row" sets it for charts. https://docs.mixpanel.com/docs/boards , https://community.amplitude.com/discussion/6524/decease-chart-width-button-where-did-it-go , https://docs.stripe.com/stripe-apps/patterns/chart-layout
- Row unit 8px (Grafana uses a fixed row unit, 30px, with gravity that closes gaps; Locus can use a finer unit with the same gravity rule). https://grafana.com/docs/grafana/latest/dashboards/build-dashboards/view-dashboard-json-model/
- Fixed chart heights: 180px in tiles, 320px on platform and detail screens (Stripe's documented Dashboard sizes). https://docs.stripe.com/stripe-apps/patterns/chart-layout
- Layout type: stratified (most important row on top) inside grouped sections with labels, collapsible, as Shopify does; the top stratum fits the screen (screenfit), everything below is detail (Bach et al.). https://dashboarddesignpatterns.github.io/patterns.html and https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/overview-dashboard/customizing-overview-dashboard
- Sidebar: collapsible and a notch dimmer than content (Vercel's resizable, hideable sidebar; Linear's dimmer sidebar). https://vercel.com/changelog/dashboard-navigation-redesign-rollout and https://linear.app/blog/behind-the-latest-design-refresh
- Sticky control bar at the top of every data screen: date range (Fixed or Rolling), compare (previous period, same dates last year, none), scope (brand, role), attribution label; short (one row), opaque, high contrast; the comparison window always equals the current window. https://www.nngroup.com/articles/sticky-headers/ , https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/overview-dashboard/using-the-overview-dashboard , https://docs.mixpanel.com/docs/reports/insights , https://docs.northbeam.io/docs/journey/design-your-dashboard.md

### 5.7 Density

- Dev-tool density, not marketing-site airiness: PostHog's 3000 ("more information on the screen", smaller text instead of large titles, fixed panels) and Linear's "increase the hierarchy and density of navigation elements." https://posthog.com/blog/posthog-as-a-dev-tool and https://linear.app/blog/how-we-redesigned-the-linear-ui
- Tables: three row heights, condensed 40px, regular 48px, relaxed 56px, user-selectable, default regular; numbers right-aligned on the decimal; first column pinned; sticky header; six to eight visible columns by default with a column chooser instead of sideways scroll. https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables and https://www.oracle.com/webfolder/ux/middleware/richclient/guidelines5/tblInformation.html
- Card padding 16px, 20px on full tiles; section gap 32px; white space, not rules, separates groups (Few chapter 7: "delineate groups minimally"). http://www.uxmatters.com/mt/archives/2007/04/book-review-information-dashboard-design.php
- Above-the-fold budget at 1440 x 900: one control bar, one insight strip (max three items), one row of four to six tiles, one chart-plus-table or one small-multiples row. 57% of viewing time is above the fold, so that is where the answer goes. https://www.nngroup.com/articles/scrolling-and-attention/
- Icons: few and small, no colored icon backgrounds (Linear's refresh), no decorative icons in tiles (Tufte's chartjunk). https://linear.app/blog/behind-the-latest-design-refresh and https://en.wikipedia.org/wiki/Chartjunk

### 5.8 Chart style

- Lines: current period in the accent at 2px; compare period in step-8 grey, 1.5px, dashed or at 60% opacity, with a legend swatch; no area fill by default (Grafana's gradient default is None); fill only on a single-series area chart and only at low opacity. https://www.datawrapper.de/blog/colors , https://design.visa.com/data-visualization/charts/line-chart/examples/ , https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/time-series/
- Axes and gridlines: thin step-6 grey, 3 to 4 horizontal gridlines on intuitive steps, no vertical gridlines, no axis line when the gridlines carry the scale; preview charts in tiles have no axes at all. https://nonstrict.eu/wwdcindex/wwdc2022/110340/ and https://www.nngroup.com/articles/clutter-charts/
- Bars start at zero; stacked channel bars use the fixed channel sequence; the table underneath repeats the same colors as a 3px swatch in the first column. https://www.datawrapper.de/academy/why-our-column-and-bar-charts-start-at-zero and https://v10.carbondesignsystem.com/data-visualization/dashboards
- Direct labels at line ends instead of legends wherever there are five or fewer series. https://www.nngroup.com/articles/clutter-charts/
- A one-line heading on every chart that states the finding, Apple style ("Sales for the past 30 days are up 12%"); this is where the read already lives on Home. https://nonstrict.eu/wwdcindex/wwdc2022/110342/
- Hover: a single shared tooltip across series, showing current, compare and delta; drag to zoom with a Zoom button (Vercel). https://vercel.com/docs/observability
- Inline bars in breakdown tables share one scale per column and a zero baseline; cells never get a red-to-green background. https://metabase.com/learn/metabase-basics/querying-and-dashboards/visualization/table and https://www.nngroup.com/articles/dashboards-preattentive/
- Cohort tables: one-hue heatmap, numbers hidden until hover or toggled on, cohort size column, asterisk for in-progress periods; predicted cells striped and actual cells solid, with a payback marker where cumulative margin passes CAC (Lifetimely). https://www.perceptualedge.com/articles/visual_business_intelligence/rules_for_using_color.pdf , https://docs.mixpanel.com/docs/reports/retention , https://help.useamp.com/article/1124-ltv-cohort-report-overview
- Never: pies, donuts, gauges, 3D, dual y-axes, rainbow categories, truncated bars (section 4). https://www.nngroup.com/articles/dashboards-preattentive/ and https://www.datawrapper.de/blog/dualaxis
- Anomaly marks: a small semantic dot on the series point and a pink or amber band for the window, grouped into one issue when several widgets move together (Datadog). https://docs.datadoghq.com/dashboards/graph_insights/investigate_anomalies/

### 5.9 The three layout templates

All three share the shell: collapsible rail on the left (dimmer than content), a one-row sticky control bar (range, compare, scope, attribution label), a Cmd/Ctrl K command and ask box, and the Strategist docked as a right-hand panel that knows which screen and period you are on (Grafana Assistant, PostHog AI). https://grafana.com/blog/llm-grafana-assistant/ , https://posthog.com/docs/max-ai , https://maggieappleton.com/command-bar

Template A: Overview (Home for each role, and the client share view)
1. Insight strip, top, up to three ranked items, each typed (trending up, trending down, top performer, anomaly) with a "See why" that opens the right screen at the right period; nothing flashes. https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/overview-dashboard/using-the-overview-dashboard and https://www.nngroup.com/videos/alert-fatigue-user-interfaces/
2. The read: one sentence that states the finding for the period, Apple's "chart heading" at page scale. https://nonstrict.eu/wwdcindex/wwdc2022/110342/
3. Hero row, top left: the one number the role owns (owner: net profit or blended revenue; buyer: blended CAC or MER; strategist: creative win rate), largest on the page, with delta, sparkline and a bullet bar for pace against the month's target (Few's placement, Stripe's header-above-chart). https://www.dummies.com/article/excel-dashboard-design-principle-use-layout-and-placement-to-draw-focus-138383 and https://docs.stripe.com/stripe-apps/patterns/chart-layout
4. Four to five supporting tiles to its right, compact or full, same anatomy, ordered by the role's decision sequence (Few: group by question). http://www.uxmatters.com/mt/archives/2007/04/book-review-information-dashboard-design.php
5. One main chart, 320px, daily series for the period with the compare period ghosted, channel toggles as a fixed-order legend; drag to zoom. https://vercel.com/docs/observability
6. Small-multiples row: one 180px panel per brand on a shared scale, sorted by the hero metric, each a link to that brand (Tufte, Datawrapper). https://en.wikipedia.org/wiki/Small_multiple and https://www.datawrapper.de/blog/what-to-consider-when-creating-small-multiple-line-charts
7. Below the fold only: the brand table (sparkline column, inline bars, pinned first column) and the channel stack with its table. https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables
The client share view is Template A with the strategist and buyer tiles removed, no money the client should not see, and the read written in the plain-English brief voice.

Template B: Platform screen (Meta, Google, TikTok, Email and SMS, Store)
1. Control bar adds the platform's own selectors: attribution model and window printed next to the date picker and repeated as a caption on every chart, because the model changes the numbers (Northbeam's "keep them stable", the Triple Whale traps). https://docs.northbeam.io/docs/overview-page.md and https://docs.northbeam.io/docs/journey/design-your-dashboard.md
2. Tile row: spend, revenue, ROAS, CPA or CAC, purchases, with polarity-aware deltas; this is the Stripe and Grafana tile. https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/stat/
3. Chart plus table, the universal pair: stacked bars by campaign group or channel on top (320px), a breakdown table directly under it with inline bars, same colors, totals row, sortable, drill to campaign, ad set, ad (Northbeam's "similar to the UI that you typically see inside your ad manager platforms"). https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/new-analytics and https://docs.northbeam.io/docs/sales.md
4. For creative-heavy platforms, the creative grid: thumbnail, name, concept and hook chips, spend-sorted, with grouped comparative bars above it and "select up to N to chart" (Motion, Northbeam). https://help.motionapp.com/en/articles/8757626-identify-creative-trends-with-comparative-reports and https://docs.northbeam.io/docs/creative-analytics.md
5. For Email and SMS, revenue-per-recipient and attributed revenue as the hero, flows vs campaigns as two columns, benchmarks as grey bands on the bullet bars rather than color grades. https://www.klaviyo.com/features/reporting and https://www.klaviyo.com/features/benchmarks
6. Anomaly markers on the chart and a "what connecting adds" card for platforms not yet wired. https://docs.datadoghq.com/dashboards/graph_insights/investigate_anomalies/

Template C: Detail / table screen (Customers, Orders, Reports, saved dashboards, any drill target)
1. Control bar carried over intact from the tile that launched it (Apple continuity; Power BI "Keep all filters"). https://nonstrict.eu/wwdcindex/wwdc2022/110342/ and https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-drillthrough
2. A compact summary row of three to four tiles above the table so the table has context (Mercury's two charts above the transactions table). https://mercury.com/blog/updated-transactions-page
3. One chart (320px) or a cohort triangle, then the full-width table: sticky header, pinned identifier column, six to eight default columns with a column chooser, inline bars, right-aligned tabular numbers, row density toggle, saved views named after questions ("Monthly money out"), filter chips with a query field (Polaris Filters), CSV export. https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables , https://mercury.com/blog/updated-transactions-page , https://polaris.shopify.com/components/filters
4. Row click opens a side panel, not a new page, so the table stays in view (Stripe's ContextView, Amplitude's alert side panel). https://docs.stripe.com/stripe-apps/design and https://amplitude.com/docs/en/analytics/insights
5. The ask box here produces a visible, editable query and a caption of what it asked, Sidekick style, so the number can be trusted and re-run. https://changelog.shopify.com/posts/turn-business-questions-into-analytics-reports-with-natural-language-queries

### 5.10 The ten token decisions, in one list

1. Neutral: a 12-step warm graphite scale, dark app background about #121212 to #141416, light canvas near-white; LCH-even steps. (Material, Radix, Linear, Datawrapper)
2. Accent: the existing per-app accent, chrome and current-series only, desaturated in dark mode to 4.5:1. (Linear, Few, Material)
3. Semantic: good green, warn amber, bad red, info blue; always with an arrow, sign or label; metric polarity decides which is which. (Carbon, Radix, Few, Grafana)
4. Categorical: one fixed six-color channel sequence, medium intensity, same order on every screen. (Datawrapper, Carbon)
5. Sequential: one hue pale to dark; diverging: blue and red around neutral. (Few)
6. Type: Inter with Inter Display for hero numbers, tabular lining numerals everywhere numeric, a mono only for IDs and queries; 13/1.4 body, 12 minimum, 28 to 32 tile values. (Linear, Datawrapper, fontalternatives, Geist)
7. Tile: label, value, delta chip, sparkline with band and end dot, bullet bar, whole tile is the link, two sizes, fixed heights. (Pencil and Paper, Tufte, Few, Stripe, Shopify)
8. Grid: 12 columns, 24px gutters, four tiles or three charts per row max, 180px tile charts, 320px screen charts, 8px row unit with gravity. (Mixpanel, Amplitude, Stripe, Grafana)
9. Density: dev-tool, 40/48/56 table rows, pinned first column, no sideways scroll, white space over rules, top stratum screenfit at 1440 x 900. (PostHog, Linear, Pencil and Paper, Oracle, Bach et al., NN/g)
10. Charts: accent line over a grey ghost, three or four gridlines, zero-based bars, direct labels, finding in the heading, no pies, donuts, gauges, 3D or dual axes. (Datawrapper, Apple, NN/g, Few)
