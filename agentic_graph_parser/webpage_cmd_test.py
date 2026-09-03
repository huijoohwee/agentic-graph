import inspect
import unittest

from . import webpage_cmd
from .webpage_cmd import (
    SimpleMarkdownParser,
    _extract_structured_details_markdown,
    _table_html_to_markdown,
)


class SimpleMarkdownParserTableTest(unittest.TestCase):
    def test_source_html_table_is_emitted_as_markdown_pipe_table(self) -> None:
        parser = SimpleMarkdownParser(base_url="https://example.com/")
        parser.feed(
            """
            <main>
              <table class="pricing">
                <tr><th>Plan</th><th>Details</th></tr>
                <tr><td>Team | Plus</td><td>Fast<br>Shared</td></tr>
              </table>
            </main>
            """
        )

        markdown = parser.get_markdown()

        self.assertIn("| Plan | Details |", markdown)
        self.assertRegex(markdown, r"\| -{3,} \| -{3,} \|")
        self.assertIn(r"| Team \| Plus | Fast Shared |", markdown)
        self.assertNotIn("<table", markdown.lower())
        self.assertNotIn("<br", markdown.lower())


def main() -> int:
    html = """
    <html>
      <head><title>Test</title></head>
      <body>
        <nav>
          <a href=/products>Products</a>
          <div>
            <a href=/products/player>Player</a>
            <a href=/products/lambda>Lambda</a>
            <a href=/products/timeline>Timeline</a>
            <a href=/products/recorder>Recorder</a>
          </div>
          <a href=/resources>Resources</a>
        </nav>
        <section>
          <h2>Templates</h2>
          <a href=/templates/blank><span>Blank</span></a>
          <a href=/templates/hello><span>Hello World</span></a>
          <a href=/templates/next>Next.js</a>
          <a href=/templates/prompt>Prompt to Motion</a>
          <a href=/templates/router>React Router</a>
        </section>
        <section>
          <h2>Pricing</h2>
          <div>Free License</div>
          <div>Company License</div>
          <div>Enterprise License</div>
          <div>$25/mo</div>
          <div>$0.01 /mo</div>
          <div>Starting at $500/mo</div>
        </section>
        <table>
          <tr><th>Feature</th><th>Free</th><th>Company</th></tr>
          <tr><td>Cost</td><td>$0</td><td>$25/mo</td></tr>
        </table>
      </body>
    </html>
    """

    details = _extract_structured_details_markdown(html, base_url="https://example.com/")
    if "## Extracted Navigation Menus" not in details:
        raise SystemExit("missing nav section")
    if "Primary: Products | Player | Lambda | Timeline | Recorder | Resources" not in details:
        raise SystemExit("missing primary navigation menu")
    if "## Templates" not in details or "Hello World" not in details:
        raise SystemExit("missing template names")
    if "## Pricing (Extracted)" not in details:
        raise SystemExit("missing pricing extract")
    if "## Pricing Details (Extracted)" not in details:
        raise SystemExit("missing pricing details table")

    md_table = _table_html_to_markdown(
        "<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>",
        max_rows=5,
        max_cols=4,
    )
    if "| A | B |" not in md_table:
        raise SystemExit("table markdown conversion failed")

    fetch_source = inspect.getsource(webpage_cmd._fetch_url)
    forbidden_fetch_tokens = ("verify" + "=False", "legacy " + "SSL")
    if any(token in fetch_source for token in forbidden_fetch_tokens):
        raise SystemExit("webpage fetch must keep TLS verification enabled")

    result = unittest.TextTestRunner().run(
        unittest.defaultTestLoader.loadTestsFromTestCase(SimpleMarkdownParserTableTest)
    )
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
