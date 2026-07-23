//
//  MessagesViewController.swift
//  Daily5 MessagesExtension
//
//  Wraps the Daily5 web app (https://trumooo.github.io/daily5/) in an
//  iMessage app extension. The web app detects it is running inside the
//  extension (?imsg=1) and, instead of opening a share sheet, posts the
//  card text + link to the "daily5" script message handler below, which
//  inserts it into the active conversation as an MSMessage.
//

import UIKit
import Messages
import WebKit

class MessagesViewController: MSMessagesAppViewController, WKScriptMessageHandler {

    private var webView: WKWebView!
    private let appURL = URL(string: "https://trumooo.github.io/daily5/?imsg=1")!

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()

        let contentController = WKUserContentController()
        contentController.add(self, name: "daily5")

        let config = WKWebViewConfiguration()
        config.userContentController = contentController

        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 1.0, green: 0.965, blue: 0.945, alpha: 1.0) // cream
        webView.scrollView.backgroundColor = webView.backgroundColor
        view.addSubview(webView)

        webView.load(URLRequest(url: appURL))
    }

    override func willBecomeActive(with conversation: MSConversation) {
        super.willBecomeActive(with: conversation)

        // If the user tapped a Daily5 message bubble, route the web app to
        // the embedded card/game state.
        if let messageURL = conversation.selectedMessage?.url,
           let fragment = messageURL.fragment {
            var target = URLComponents(url: appURL, resolvingAgainstBaseURL: false)!
            target.fragment = fragment
            if let url = target.url {
                webView.load(URLRequest(url: url))
            }
        }
    }

    // MARK: - WKScriptMessageHandler

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard message.name == "daily5",
              let body = message.body as? [String: Any],
              let text = body["text"] as? String,
              let conversation = activeConversation else { return }

        let layout = MSMessageTemplateLayout()
        layout.caption = text
        layout.subcaption = "Daily5 🪸"
        layout.image = UIImage(named: "MessageCard") // 300x300 coral card in the asset catalog

        let msg = MSMessage(session: MSSession())
        msg.layout = layout
        msg.summaryText = text
        if let urlString = body["url"] as? String, let url = URL(string: urlString) {
            // The state-carrying URL: opening the bubble routes the recipient's
            // extension (or Safari, if they don't have the app) to this state.
            msg.url = url
        }

        conversation.insert(msg) { [weak self] error in
            if error == nil {
                DispatchQueue.main.async {
                    self?.requestPresentationStyle(.compact)
                }
            }
        }
    }
}
