# TODOs

## Features

- Add option for user to choose the aspect ratio
- Add a template creation page and marketplace
- Add an option to use a locally hosted llm server for generation
- Add an option to use openAI auth for the model provider
- Find a way to implement images in the presentations
- Add an option to add files as inputs
- Make streaming partially returned slide data possible
- Add widget generation functionality into slides
- Implement background images
- Have the images embedded in the ppts have different levels of possible belnding with the background of the theme
- Make the deletion of a presentation a one click process with an undo colldown
- Introduce a vim mode to navigate the entire application
- Give each slide a proper gird for user assisted placement of things
- The presentations page makes a db request everytime its switched off of, make it keep a local copy of metadata ready
- Make sure the input tokens are counted towards tokens utilization specially when web search is used
- User beyond a certain number of tokens can have multiple generations going at once
- Implement adding AI generated animations to slides
- Implement ability to add presenter notes.
- Add passkeys auth
- Merge observability
- Merge a finished landing page
- Implement an 'add and edit esitsting PPT' flow to the ooxml template implementation
- Provision the ONLYOFFICE document server and turn the browser editor on, tracked on the `onlyoffice-editor` bookmark. The API callback flow, the signed session route and the `OfficeEditor` component are already written and dormant; what is missing is the deployment.
  Decide the hosting form first: a GCE VM running the container is vendor supported and keeps editing state on a persistent disk, Cloud Run matches the rest of the stack but would hold the bundled Postgres on an in-memory disk that can be recycled mid edit, and GKE with the Helm chart externalises state but adds a cluster.
  Then wire a `docs.slidesage.app` hostname on the existing load balancer using a separate managed certificate so the API certificate is never recreated, add `ONLYOFFICE_JWT_SECRET` and the Developer Edition licence file to Secret Manager, mount the licence at `/var/www/onlyoffice/Data/license.lic`, and set `ONLYOFFICE_DOCUMENT_SERVER_URL` on the API.
  The viewer deliberately ships preview only until then, so restoring the `Edit presentation` control is part of that work.

## Issues

- The charts showing percentages and other metrics on hover should instead have it displayed from the get go
- Current export functionality is a liability
- The nav controls in fullscreen view should dissapear after a delay and also be narrower
- Iterations not working
- When a user has just retreved a web result switching away from it should retain it in the generate page still
- The marketplace search bar looks nothing like the presentaion page bar
- URGENT: Replace `semantic caching` with normal word to word match being a cache hit.
