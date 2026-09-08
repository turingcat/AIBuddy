import React from "react";
import Admonition from "@theme/Admonition";

const SupportedEnvironments = () => {
  return (
    <Admonition type="info" title="Supported Environments">
      The heybuddy CLI currently supports Apple Silicon on <strong>macOS</strong> and both <strong>ARM</strong> and <strong>x86</strong> architectures on <strong>Linux</strong>.
      On <strong>Windows</strong>, heybuddy CLI can run via WSL, and heybuddy Desktop is natively supported. If you'd like to request support for additional operating systems, please{" "}
      <a
        href="https://github.com/aaif-goose/goose/discussions/867"
        target="_blank"
        rel="noopener noreferrer"
      >
        vote on GitHub
      </a>.
    </Admonition>
  );
};

export default SupportedEnvironments;
