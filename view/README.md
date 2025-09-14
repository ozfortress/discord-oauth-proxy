# Customization

Customization of your login screen is available by modifying the HTML/CSS in page.html and style.css.

These files are referenced at runtime, but do not need to be accessible to the public. `server.js` will look for them in `./view/`

CSS is injected into the HTML by the server by replacing `/* CSS_PLACEHOLDER */` in the text.

When trying to display an error, it will inject the error box with the error message in place of `<!-- ERROR_PLACEHOLDER -->` with `<div class="error-notice">(error message)</div>`. You can modify the appearance of this box in style.css.

If you want to make more extensive changes, you can modify the HTML structure in page.html. Just be sure to keep those placeholders.
