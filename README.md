# Workers-snippets

根据mingyu的snippets版本结合天书大佬的控流用AI改的，控流从6m开始提升，无上限，自测浏览器单线程下载10G的大文件可以下载完毕

snippets_nohttp.js为去掉http的版本，path不支持/h和/gh参数

snippets_nos5.js为snippets部署的版本，path只支持/p参数，也就是支持proxyip的用法，不支持socks5和http

grainTCP_worker.js为worker部署版本，使用AK大佬的GrainTCP方式，我自己测试下载单文件可以2.5G-5G之间，没有snippets的可以部署这个.path支持/p,/s,/g三种方式

* 群聊: [HeroCore](https://t.me/HeroCore)
* 频道: [HeroMsg](https://t.me/HeroMsg)


  * `/s=admin:123456@123.123.28.123:13333?ed=2560`（仅SOCKS5）
  * `/g=admin:123456@123.123.28.123:13333?ed=2560`（全局SOCKS5）
  * `/p=ProxyIP.US.CMLiussss.net?ed=2560`（仅Proxyip）
  * `/h=192.168.1.1:1080?ed=2560`（回退http）
  * `/gh=192.168.1.1:1080?ed=2560`（全局http）
 
> 可以使用  other/ip-query-gemini.js  的代码部署到Cloudflare workers来查询IP

> 不想部署的话，可以使用我搭建的  https://ip.661388.xyz   ,点击IP可查看详细信息。
<img width="2654" height="1326" alt="image" src="https://github.com/user-attachments/assets/dfc67843-e3c7-4b72-b2cc-8dc443ede7f0" />
