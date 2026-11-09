import AppKit
let home = FileManager.default.homeDirectoryForCurrentUser.path
for (label,color,paths) in [
 ("我",NSColor.systemBlue,[home+"/Desktop/个人 QQ.app",home+"/Applications/QQ-MAS.app",home+"/Desktop/打开个人QQ.command"]),
 ("祸",NSColor.systemPurple,[home+"/Desktop/小伴机器人.app","/Applications/QQ.app",home+"/Desktop/启动小伴.command"])
] {
 let image=NSImage(size:NSSize(width:512,height:512))
 image.lockFocus()
 color.setFill();NSBezierPath(roundedRect:NSRect(x:16,y:16,width:480,height:480),xRadius:104,yRadius:104).fill()
 let attrs:[NSAttributedString.Key:Any] = [.font:NSFont.systemFont(ofSize:300,weight:.bold),.foregroundColor:NSColor.white]
 let text=label as NSString;let size=text.size(withAttributes:attrs)
 text.draw(at:NSPoint(x:(512-size.width)/2,y:(512-size.height)/2+12),withAttributes:attrs)
 image.unlockFocus()
 for path in paths {print(path,NSWorkspace.shared.setIcon(image,forFile:path,options:[]))}
}
