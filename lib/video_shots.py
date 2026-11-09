"""Editorial framing: image-derived backgrounds, real footage stays moving."""
def shot_plan(spec,count):
    shots=spec.get('shot_plan')
    if shots is None:
        shots=[{'layout':['portrait','wide','detail'][i%3],'purpose':'与该段旁白对应的画面'} for i in range(count)]
    if not isinstance(shots,list) or len(shots)!=count:raise ValueError('shot_plan必须与分镜一一对应')
    for shot in shots:
        if shot.get('layout') not in ('portrait','wide','detail','card'):raise ValueError('镜头layout无效')
        if not isinstance(shot.get('purpose'),str) or not 5<=len(shot['purpose'])<=120:raise ValueError('每个镜头必须说明画面表达的具体内容')
    return shots

def shot_filter(layout,index,seconds,*,card=False):
    if card or layout=='card':
        return '[1:v]fps=30,scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x171b33,setsar=1,format=yuv420p[v]'
    # Keep the entire subject visible; do not blindly crop faces or wide footage.
    width,height={'portrait':(1000,1480),'wide':(1080,1100),'detail':(1080,1540)}[layout]
    return (f'[1:v]fps=30,split=2[bg][fg];'
            '[bg]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,gblur=sigma=18,scale=1080:1920,eq=brightness=-0.22:saturation=0.65[back];'
            f'[fg]scale={width}:{height}:force_original_aspect_ratio=decrease,setsar=1[art];'
            "[back][art]overlay=x='(W-w)/2':y='(H-h)/2-85':shortest=1,setsar=1,format=yuv420p[v]")
