// Recursos do executável Windows (ícone + VERSIONINFO + manifesto).
//
// VERSIONINFO importa para antivírus e SmartScreen: um exe sem editor/produto/descrição parece anônimo
// e cai mais fácil em heurística. Os campos abaixo também aparecem em "Propriedades → Detalhes".
#[cfg(windows)]
fn main() {
    let versao = env!("CARGO_PKG_VERSION");
    // x.y.z.0 (recurso de versão exige 4 números)
    let quatro = {
        let mut partes: Vec<u32> = versao
            .split('.')
            .filter_map(|p| p.chars().take_while(|c| c.is_ascii_digit()).collect::<String>().parse().ok())
            .collect();
        while partes.len() < 4 {
            partes.push(0);
        }
        format!("{}.{}.{}.{}", partes[0], partes[1], partes[2], partes[3])
    };

    let mut res = winres::WindowsResource::new();
    res.set_icon("../build/assets/castdeck.ico");
    res.set_manifest(
        r#"<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <assemblyIdentity type="win32" name="live.flue.castdeck" version="1.0.0.0" processorArchitecture="amd64"/>
  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3">
    <security><requestedPrivileges>
      <requestedExecutionLevel level="asInvoker" uiAccess="false"/>
    </requestedPrivileges></security>
  </trustInfo>
  <compatibility xmlns="urn:schemas-microsoft-com:compatibility.v1">
    <application>
      <supportedOS Id="{8e0f7a12-bfb3-4fe8-b9a5-48fd50a15a9a}"/>
      <supportedOS Id="{1f676c76-80e1-4239-95bb-83d0f6d0da78}"/>
    </application>
  </compatibility>
</assembly>"#,
    );
    res.set("FileDescription", "CastDeck Local");
    res.set("ProductName", "CastDeck Local");
    res.set("CompanyName", "flue.live — Miguel Kallemback");
    res.set("LegalCopyright", "Copyright © 2026 Miguel Kallemback / flue.live. AGPL-3.0.");
    res.set("OriginalFilename", "CastDeck.exe");
    res.set("InternalName", "CastDeck");
    res.set("Comments", "Estúdio de transmissão ao vivo 100% local — https://cast.flue.live");
    res.set("FileVersion", &quatro);
    res.set("ProductVersion", &quatro);
    res.compile().unwrap();
}

#[cfg(not(windows))]
fn main() {}
