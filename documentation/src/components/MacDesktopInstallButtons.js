import Link from "@docusaurus/Link";
import { IconDownload } from "@site/src/components/icons/download";

const DesktopInstallButtons = () => {
  return (
    <div>
      <p>Download aibuddy Desktop for macOS Apple Silicon:</p>
      <div className="pill-button" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <Link
          className="button button--primary button--lg"
          to="https://github.com/aaif-goose/goose/releases/download/stable/Goose.zip"
        >
          <IconDownload /> macOS Silicon
        </Link>
      </div>
    </div>
  );
};

export default DesktopInstallButtons;
