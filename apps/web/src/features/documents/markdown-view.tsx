import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Renders a generated document. The text is untrusted (AI output built from
// customer source): raw HTML in it is dropped (`skipHtml`), never parsed, and
// react-markdown's default URL filter removes javascript:/data: links
// (FE-06). Only Markdown + GitHub tables/task lists are interpreted.
export function MarkdownView({ content }: { content: string }) {
  return (
    <div className="md-view">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          // Wide tables scroll inside the viewer instead of the page.
          table: ({ children }) => (
            <div className="md-table">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
