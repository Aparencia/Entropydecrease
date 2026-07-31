{
  "targets": [
    {
      "target_name": "process_audio",
      "sources": [
        "src/addon.cc",
        "src/window_finder.cc",
        "src/loopback_capture.cc"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS",
        "UNICODE",
        "_UNICODE"
      ],
      "conditions": [
        [
          "OS=='win'",
          {
            "libraries": [
              "-lole32.lib",
              "-loleaut32.lib",
              "-lavrt.lib",
              "-lmmdevapi.lib",
              "-lruntimeobject.lib"
            ],
            "msvs_settings": {
              "VCCLCompilerTool": {
                "AdditionalOptions": [
                  "/utf-8"
                ]
              }
            }
          }
        ]
      ]
    }
  ]
}
