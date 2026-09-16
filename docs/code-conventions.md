# Overly simplified style guide
  - set your .editorconfig to use spaces and 2 space tab stop everywhere,
    unless the language you are using has special requirements (the most
    famous being Makefile and mail config).
  - Use 1TBS (1 True Brace Style) for code; exception of course is Python
    and its cousins that don't use braces.
  - I personally prefer using semicolons to terminate statements; this can
    avoid a class of errors when you are forced to work in an environment
    without developer tools. For example, when you are in operations and
    have to edit code for a hot patch using the dumbest editor available,
    sticking to the practice of using semicolons and spaces (instead of 
    tabs) can get you out of the bind more quickly.
  - Modern editors have spoiled us tremendously. Think again of the DevOps
    person looking at your code in a production environment without the
    luxury of having VS Code handy. They will appreciate if you can keep
    your statements to be less than 80 characters per line.

# File and folder naming conventions
  - stick to lower case name:  Windows is case insensitive leading to many
    frustrating issues with version control systems when checking out code
    on Windows where one developer uses lower case and another checks in a
    file with upper case starting letter.
  - use kebab-case for names (folders and files) and name them meaningfully.
    For example, "assets/icons/iphone-64x32.png" is better than 
    "assets/icons/iphone-small.png".  In other words convey as much 
    information as you can with your name, **without** introducing 
    redundancy
  - Use meaningful names even if it results in longer names. For example,
   "images/agile-transformation.svg" is better than 
   "images/Agile-trans.svg".
  - a folder is a container - use it minimally, judiciously and when 
    possible for semantic reasons, and not purely for organization. Take a
    look at your kitchen. I am sure you will be able to identify various
    containers of various shapes serving different functions.
  - Try to keep the containment hierarchy between 3 - 5; this is where
    semantic matters; navigability trumps organization. For example,
    "public/assets/images" containing all image sizes is better than
    "public/assets/images/small", "public/assets/images/medium" and 
    "public/assets/images/large".

# Imports and dependencies
  - Organize `import` statements from least likely to change to most likely
    to change. Further organize import statements into two groups:
    - external dependencies come first
    - internal dependencies next
    - separate the two groups with a single blank line
  - write tests based on use cases and test for functionality instead of
    visual appearances
  - please have a discussion before adding external dependencies
