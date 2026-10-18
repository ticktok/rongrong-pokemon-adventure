import json,pathlib
topics=[
("颜色与感受","red=红色;blue=蓝色;green=绿色;yellow=黄色;black=黑色;white=白色;orange=橙色;pink=粉色;purple=紫色;brown=棕色;grey=灰色;happy=开心的;sad=难过的;angry=生气的;tired=累的;hungry=饥饿的;thirsty=口渴的;hot=热的;cold=冷的;warm=温暖的;cool=凉爽的;good=好的;bad=坏的;nice=友好的;beautiful=美丽的"),
("数字与形状","one=一;two=二;three=三;four=四;five=五;six=六;seven=七;eight=八;nine=九;ten=十;eleven=十一;twelve=十二;thirteen=十三;fourteen=十四;fifteen=十五;sixteen=十六;seventeen=十七;eighteen=十八;nineteen=十九;twenty=二十;hundred=一百;circle=圆形;square=正方形;triangle=三角形;rectangle=长方形"),
("动物朋友","cat=猫;dog=狗;bird=鸟;fish=鱼;rabbit=兔子;duck=鸭子;chicken=鸡;cow=奶牛;horse=马;sheep=绵羊;pig=猪;goat=山羊;mouse=老鼠;lion=狮子;tiger=老虎;elephant=大象;monkey=猴子;panda=熊猫;bear=熊;giraffe=长颈鹿;zebra=斑马;snake=蛇;frog=青蛙;turtle=乌龟;butterfly=蝴蝶"),
("美味食物","apple=苹果;banana=香蕉;pear=梨;peach=桃子;grape=葡萄;watermelon=西瓜;strawberry=草莓;lemon=柠檬;cherry=樱桃;mango=芒果;rice=米饭;noodles=面条;bread=面包;cake=蛋糕;egg=鸡蛋;milk=牛奶;juice=果汁;water=水;tea=茶;soup=汤;potato=土豆;tomato=番茄;carrot=胡萝卜;meat=肉;cheese=奶酪"),
("家人与朋友","father=爸爸;mother=妈妈;brother=兄弟;sister=姐妹;grandfather=祖父或外祖父;grandmother=祖母或外祖母;uncle=叔叔或舅舅;aunt=姑姑或阿姨;cousin=堂兄弟姐妹或表兄弟姐妹;baby=婴儿;family=家庭;friend=朋友;boy=男孩;girl=女孩;man=男人;woman=女人;child=孩子;people=人们;teacher=老师;student=学生;doctor=医生;nurse=护士;farmer=农民;driver=司机;cook=厨师"),
("我的身体","head=头;face=脸;eye=眼睛;ear=耳朵;nose=鼻子;mouth=嘴;tooth=牙齿;tongue=舌头;hair=头发;neck=脖子;shoulder=肩膀;arm=手臂;hand=手;finger=手指;thumb=拇指;leg=腿;knee=膝盖;foot=脚;toe=脚趾;back=背部;body=身体;heart=心脏;skin=皮肤;stomach=胃;elbow=肘部"),
("快乐校园","school=学校;classroom=教室;desk=课桌;chair=椅子;book=书;pen=钢笔;pencil=铅笔;eraser=橡皮;ruler=尺子;bag=书包;paper=纸;notebook=笔记本;crayon=蜡笔;board=黑板;library=图书馆;playground=操场;computer=电脑;lesson=课;homework=家庭作业;English=英语;math=数学;music=音乐;art=美术;science=科学;question=问题"),
("温暖的家","home=家;house=房子;room=房间;bedroom=卧室;kitchen=厨房;bathroom=浴室;door=门;window=窗户;wall=墙;floor=地板;bed=床;sofa=沙发;table=桌子;lamp=台灯;clock=钟;mirror=镜子;cup=杯子;plate=盘子;bowl=碗;spoon=勺子;fork=叉子;knife=刀;fridge=冰箱;phone=电话;key=钥匙"),
("衣服与物品","shirt=衬衫;T-shirt=T恤;coat=外套;jacket=夹克;sweater=毛衣;dress=连衣裙;skirt=裙子;trousers=裤子;shorts=短裤;shoes=鞋;socks=袜子;hat=帽子;cap=鸭舌帽;scarf=围巾;gloves=手套;umbrella=雨伞;watch=手表;glasses=眼镜;ball=球;kite=风筝;toy=玩具;doll=玩偶;robot=机器人;bike=自行车;car=汽车"),
("大自然","sun=太阳;moon=月亮;star=星星;sky=天空;cloud=云;rain=雨;snow=雪;wind=风;tree=树;flower=花;grass=草;leaf=树叶;river=河流;lake=湖;sea=海;mountain=山;forest=森林;island=岛屿;beach=海滩;stone=石头;sand=沙子;earth=地球;rainbow=彩虹;weather=天气;garden=花园"),
("一起行动","run=跑;walk=走;jump=跳;swim=游泳;fly=飞;read=阅读;write=写;draw=画画;sing=唱歌;dance=跳舞;listen=听;speak=说话;look=看;see=看见;eat=吃;drink=喝;sleep=睡觉;wake=醒来;wash=洗;play=玩;open=打开;close=关闭;sit=坐;stand=站;help=帮助"),
("时间与方向","Monday=星期一;Tuesday=星期二;Wednesday=星期三;Thursday=星期四;Friday=星期五;Saturday=星期六;Sunday=星期日;morning=早晨;afternoon=下午;evening=傍晚;night=夜晚;today=今天;tomorrow=明天;yesterday=昨天;spring=春天;summer=夏天;autumn=秋天;winter=冬天;left=左边;right=右边;up=上方;down=下方;in=在里面;on=在上面;under=在下面")
]
words=[]
for topic_id,(topic,entries) in enumerate(topics):
    pairs=entries.split(";")
    assert len(pairs)==25,(topic,len(pairs))
    for i,pair in enumerate(pairs):
        word,meaning=pair.split("=")
        example='Let us say "'+word+'".'
        if topic_id==0: example="It is "+word+"."
        if topic_id in [2,3,5,6,7,8,9] and word not in ['people','noodles','rice','milk','juice','water','tea','soup','meat','cheese','hair','paper','homework','English','math','music','art','science','trousers','shorts','shoes','socks','gloves','glasses','grass','rain','snow','wind','sand','weather']:
            example="Look at the "+word.lower()+"."
        if topic_id==10: example="I can "+word+"."
        if topic_id==11 and i<7: example="Today is "+word+"."
        words.append({"id":"word-"+str(topic_id+1)+"-"+str(i+1),"word":word,"meaning":meaning,"topic":topic,"level":1 if i<15 else 2,"example":example})
assert len(words)==300 and len({w["word"].lower() for w in words})==300
root=pathlib.Path(__file__).resolve().parents[1]
(root/"content/words.json").write_text(json.dumps(words,ensure_ascii=False,indent=2))
print("300 unique words ready")
