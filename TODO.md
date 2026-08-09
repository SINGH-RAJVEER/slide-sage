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

## Issues

- In the deployment sign out button does not function properly
- When checking presentations, the entire page shouldnt load, instead just the part with the actual presentations listing
- The second generate is pressed it should lead to the viewer page with loaders waiting for the stream to start
- The charts showing percentages and other metrics on hover should instead have it displayed from the get go
- Fix the pricing model and make the discounts apply to the custom values
- Opening a seperate ppt when another is already generating leads to the generating ppt on the viewer page
- Generation indicator on hover too small
- The indicator for a generating ppt shows as retry instead of generating in the viewer page
- Figure out what a better auth session token is doing being assigned during login
- Remove unused type files from the types lib
